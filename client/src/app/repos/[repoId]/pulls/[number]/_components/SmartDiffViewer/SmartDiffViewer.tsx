"use client";

import React, { useState } from "react";
import { Skeleton, SectionLabel } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useSmartDiff } from "@/lib/hooks";
import type { SmartDiffRole, SmartDiffFile } from "@devdigest/shared";
import { s } from "./styles";
import { parsePatch } from "./parsePatch";

interface SmartDiffViewerProps {
  prId: string;
  targetFile?: string;
  targetLine?: number;
  targetNonce?: number;
  onFindingClick?: (findingId: string) => void;
}

const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent-text)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};

const ROLE_SUBTITLE: Record<SmartDiffRole, string> = {
  core: "The substance of the change — review closely",
  wiring: "Hooks the core into the app",
  boilerplate: "Generated / mechanical — skim",
};

const SEVERITY_BADGE: Record<
  string,
  { label: string; color: string; bg: string; icon: string }
> = {
  CRITICAL: { label: "blocker", color: "var(--crit)", bg: "var(--crit-bg)", icon: "⊘" },
  WARNING: { label: "warning", color: "var(--warn)", bg: "var(--warn-bg)", icon: "⚠" },
  SUGGESTION: { label: "suggestion", color: "var(--sugg)", bg: "var(--sugg-bg)", icon: "%" },
};

function FileCardBody({ file, onFindingClick }: { file: SmartDiffFile; onFindingClick?: (findingId: string) => void }) {
  const diffLines = parsePatch(file.patch);
  if (diffLines.length === 0) return null;

  return (
    <div style={s.diffBlock}>
      {diffLines.map((line, i) => {
        const badge =
          line.lineNo != null
            ? file.findings.find((f) => f.line === line.lineNo)
            : undefined;

        const lineBg =
          line.type === "+"
            ? s.diffLineAdd
            : line.type === "-"
              ? s.diffLineDel
              : undefined;

        const signColor =
          line.type === "+"
            ? s.lineSignAdd
            : line.type === "-"
              ? s.lineSignDel
              : undefined;

        const badgeMeta =
          badge != null
            ? (SEVERITY_BADGE[badge.severity] ?? {
                label: badge.severity.toLowerCase(),
                color: "var(--text-muted)",
                bg: "var(--bg-elevated)",
                icon: "•",
              })
            : null;

        return (
          <div
            key={i}
            data-line-no={line.lineNo ?? undefined}
            style={{
              ...s.diffLine,
              ...lineBg,
              borderLeft: badgeMeta != null
                ? `3px solid ${badgeMeta.color}`
                : "3px solid transparent",
            }}
          >
            <span style={s.lineNo}>
              {line.lineNo != null ? line.lineNo : " "}
            </span>
            <span style={{ ...s.lineSign, ...signColor }}>{line.type}</span>
            <span style={s.lineContent}>{line.content}</span>
            {badgeMeta != null && (
              badge?.id && onFindingClick ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onFindingClick(badge.id!); }}
                  style={{
                    ...s.severityBadge,
                    color: badgeMeta.color,
                    background: badgeMeta.bg,
                    border: "none",
                    cursor: "pointer",
                  }}
                  aria-label={`Go to finding on line ${line.lineNo}`}
                >
                  {badgeMeta.icon} {badgeMeta.label}
                </button>
              ) : (
                <span
                  style={{
                    ...s.severityBadge,
                    color: badgeMeta.color,
                    background: badgeMeta.bg,
                  }}
                >
                  {badgeMeta.icon} {badgeMeta.label}
                </span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroupSection({
  role,
  files,
  defaultExpanded,
  tFiles,
  t,
  targetFile,
  targetNonce,
  onFindingClick,
}: {
  role: SmartDiffRole;
  files: SmartDiffFile[];
  defaultExpanded: boolean;
  tFiles: (count: number) => string;
  t: ReturnType<typeof useTranslations<"prReview">>;
  targetFile?: string;
  targetNonce?: number;
  onFindingClick?: (findingId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!targetFile) return;
    if (!files.some((f) => f.path === targetFile)) return;
    setExpanded(true);
    setExpandedFiles((prev) => ({ ...prev, [targetFile]: true }));
    // files intentionally excluded — only re-run when target changes, not on every data refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFile, targetNonce]);
  const [summaryVisible, setSummaryVisible] = useState<Record<string, boolean>>({});

  const roleLabel =
    role === "core"
      ? t("smartDiff.coreLabel")
      : role === "wiring"
        ? t("smartDiff.wiringLabel")
        : t("smartDiff.boilerplateLabel");

  return (
    <div style={s.section}>
      <div
        style={s.sectionHeader}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
      >
        <span
          style={{ ...s.roleDot, background: ROLE_COLOR[role] }}
          aria-hidden="true"
        />
        <span style={s.roleLabel}>{roleLabel}</span>
        <span style={s.roleSubtitle}>{ROLE_SUBTITLE[role]}</span>
        <span style={s.fileBadge}>{tFiles(files.length)}</span>
        <span style={s.chevron}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={s.fileList}>
          {files.map((file, fileIdx) => {
            const defaultFileExpanded = file.findings.length > 0;
            const isExpanded = expandedFiles[file.path] ?? defaultFileExpanded;
            const isSum = summaryVisible[file.path] ?? true;
            const hasPatch = file.patch != null && file.patch.length > 0;

            return (
              <div key={`${fileIdx}:${file.path}`} data-file-path={file.path} style={s.fileCard}>
                <div
                  style={s.fileCardHeader}
                  onClick={() =>
                    setExpandedFiles((prev) => ({
                      ...prev,
                      [file.path]: !isExpanded,
                    }))
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setExpandedFiles((prev) => ({
                        ...prev,
                        [file.path]: !isExpanded,
                      }));
                  }}
                  aria-expanded={isExpanded}
                >
                  <span style={s.filePath} title={file.path}>
                    {file.path}
                  </span>
                  <span style={s.diffBadge}>
                    +{file.additions} -{file.deletions}
                  </span>
                  {file.pseudocode_summary != null && (
                    <button
                      type="button"
                      style={s.summaryButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSummaryVisible((prev) => ({
                          ...prev,
                          [file.path]: !isSum,
                        }));
                      }}
                      aria-label={`summary for ${file.path}`}
                    >
                      % {t("smartDiff.summary")}
                    </button>
                  )}
                </div>
                {file.pseudocode_summary != null && isSum && (
                  <div style={s.summaryText}>
                    <span style={s.summaryLabel}>What this does:</span>{" "}
                    {file.pseudocode_summary}
                  </div>
                )}
                {hasPatch && isExpanded && <FileCardBody file={file} onFindingClick={onFindingClick} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SmartDiffViewer({ prId, targetFile, targetLine, targetNonce, onFindingClick }: SmartDiffViewerProps) {
  const t = useTranslations("prReview");
  const { data, isLoading } = useSmartDiff(prId);
  const viewerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!targetFile || isLoading || !data) return;
    const scope = viewerRef.current;
    if (!scope) return;

    // The target file's line content (`[data-line-no]`) is only mounted once
    // GroupSection's own effect flips `expandedFiles[targetFile]` and React
    // commits that re-render — a sibling effect, not synchronized with this
    // one. A fixed setTimeout guessed at that timing and often lost the race.
    // Retry on every DOM mutation until the line element actually exists.
    //
    // The exact line can genuinely never appear: SmartDiffViewer renders
    // unified-diff HUNKS (a few lines of context around each change), not
    // the full file — a blast-radius caller's line can fall well outside
    // every shown hunk. Waiting forever for that line left the accordion
    // open with no scroll at all (worse than doing nothing visibly). Scroll
    // to the file immediately as a fallback, then upgrade to the exact line
    // if/when it mounts — never regress to "opens but doesn't move".
    let scrolledToFileOnce = false;
    const tryScroll = (): boolean => {
      const fileEl = Array.from(scope.querySelectorAll("[data-file-path]")).find(
        (el) => el.getAttribute("data-file-path") === targetFile,
      );
      if (!fileEl) return false;
      const lineEl =
        targetLine != null
          ? Array.from(fileEl.querySelectorAll("[data-line-no]")).find(
              (el) => el.getAttribute("data-line-no") === String(targetLine),
            )
          : undefined;
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      if (!scrolledToFileOnce) {
        scrolledToFileOnce = true;
        fileEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Keep watching (unless there was no line request at all, in which
      // case scrolling to the file already satisfied the request).
      return targetLine == null;
    };

    if (tryScroll()) return;

    const observer = new MutationObserver(() => {
      if (tryScroll()) observer.disconnect();
    });
    observer.observe(scope, { childList: true, subtree: true });
    // Safety cap so a stale observer never lingers if the target line
    // genuinely never appears (e.g. a line number outside the rendered diff).
    const timeout = setTimeout(() => observer.disconnect(), 3000);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [targetFile, targetLine, targetNonce, data, isLoading]);

  if (isLoading) {
    return (
      <div style={s.skeletonRow}>
        <Skeleton height={18} />
        <Skeleton height={14} width="80%" />
        <Skeleton height={14} width="60%" />
        <Skeleton height={18} />
        <Skeleton height={14} width="70%" />
      </div>
    );
  }

  const hasContent =
    data &&
    data.groups.length > 0 &&
    data.groups.some((g) => g.files.length > 0);

  if (!hasContent) {
    return <p style={s.emptyText}>{t("smartDiff.groupedByRole")}</p>;
  }

  let totalFiles = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const group of data.groups) {
    totalFiles += group.files.length;
    for (const file of group.files) {
      totalAdditions += file.additions;
      totalDeletions += file.deletions;
    }
  }

  const tFiles = (count: number) => t("smartDiff.filesCount", { count });

  return (
    <div ref={viewerRef} style={s.viewerRoot}>
      <SectionLabel icon="GitBranch">
        {t("smartDiff.reviewerOrderedDiff")}
      </SectionLabel>

      <p style={s.statsLine}>
        {totalFiles} files ·{" "}
        <span style={s.statsAdd}>+{totalAdditions}</span>{" "}
        <span style={s.statsDel}>-{totalDeletions}</span>
      </p>

      {data.split_suggestion.too_big && (
        <div style={s.banner}>
          <div style={s.bannerTitle}>
            {t("smartDiff.largeTitle", {
              lines: data.split_suggestion.total_lines,
            })}
          </div>
          <div style={s.bannerBody}>{t("smartDiff.largeBody")}</div>
          {data.split_suggestion.proposed_splits.length > 0 && (
            <ul style={s.bannerList}>
              {data.split_suggestion.proposed_splits.map((split) => (
                <li key={split.name}>{split.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data.groups.map((group) => (
        <GroupSection
          key={group.role}
          role={group.role}
          files={group.files}
          defaultExpanded={group.role !== "boilerplate"}
          tFiles={tFiles}
          t={t}
          targetFile={targetFile}
          targetNonce={targetNonce}
          onFindingClick={onFindingClick}
        />
      ))}
    </div>
  );
}
