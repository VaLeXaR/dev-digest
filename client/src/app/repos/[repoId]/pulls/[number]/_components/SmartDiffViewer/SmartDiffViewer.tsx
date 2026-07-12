"use client";

import React, { useState } from "react";
import { Skeleton, SectionLabel, Icon } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useSmartDiff, useLineContext, useGenerateFileSummary } from "@/lib/hooks";
import type { SmartDiffRole, SmartDiffFile, LineContextResponse } from "@devdigest/shared";
import { s } from "./styles";
import { parsePatch } from "./parsePatch";
import { translateBaseLineToHead } from "./translateLine";

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

function FileCardBody({
  file,
  onFindingClick,
  targetLine,
  targetNonce,
}: {
  file: SmartDiffFile;
  onFindingClick?: (findingId: string) => void;
  /** Set only when this file IS the navigation target (see GroupSection) — a
   * matching line number in some other file must never highlight. */
  targetLine?: number;
  targetNonce?: number;
}) {
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

        const isTargetLine = targetLine != null && line.lineNo === targetLine;

        return (
          <div
            // Re-keying just the target line on nonce forces the flash
            // animation to replay when the same line is clicked again
            // (e.g. a second Blast Radius jump while already on this tab).
            key={isTargetLine ? `${i}-${targetNonce}` : i}
            data-line-no={line.lineNo ?? undefined}
            style={{
              ...s.diffLine,
              ...lineBg,
              ...(isTargetLine ? s.diffLineTarget : undefined),
              borderLeft: isTargetLine
                ? "3px solid var(--accent)"
                : badgeMeta != null
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

/**
 * Fallback for a click-to-line target that isn't part of any rendered diff
 * hunk — a fetched window of raw file lines around it (see
 * `useLineContext`). Renders its own `[data-line-no]` markers so the
 * existing scroll-and-highlight effect in `SmartDiffViewer` picks it up the
 * same way it would a hunk line, once this block mounts.
 */
function LineContextBlock({
  ctx,
  targetLine,
  targetNonce,
}: {
  ctx: LineContextResponse;
  targetLine?: number;
  targetNonce?: number;
}) {
  return (
    <div style={s.contextBlock}>
      <div style={s.contextLabel}>
        {`Line ${ctx.target_line} — outside this diff, shown for context`}
      </div>
      <div style={s.diffBlock}>
        {ctx.lines.map((l) => {
          const isTargetLine = targetLine != null && l.line === targetLine;
          return (
            <div
              key={isTargetLine ? `ctx-${l.line}-${targetNonce}` : `ctx-${l.line}`}
              data-line-no={l.line}
              style={{
                ...s.diffLine,
                ...(isTargetLine ? s.diffLineTarget : undefined),
                borderLeft: isTargetLine ? "3px solid var(--accent)" : "3px solid transparent",
              }}
            >
              <span style={s.lineNo}>{l.line}</span>
              <span style={s.lineSign} />
              <span style={s.lineContent}>{l.content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupSection({
  prId,
  role,
  files,
  defaultExpanded,
  tFiles,
  t,
  targetFile,
  targetLine,
  targetNonce,
  lineContext,
  onFindingClick,
}: {
  prId: string;
  role: SmartDiffRole;
  files: SmartDiffFile[];
  defaultExpanded: boolean;
  tFiles: (count: number) => string;
  t: ReturnType<typeof useTranslations<"prReview">>;
  targetFile?: string;
  targetLine?: number;
  targetNonce?: number;
  /** Only set once it resolves for the CURRENT target (see SmartDiffViewer). */
  lineContext?: LineContextResponse | null;
  onFindingClick?: (findingId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const generateSummary = useGenerateFileSummary(prId);

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
            const isTargetFile = targetFile != null && file.path === targetFile;

            return (
              <div
                // Re-keyed on nonce (target file only) so a repeat click on the
                // same file/line replays the flash instead of no-op'ing on an
                // already-mounted node. This is the file-level fallback marker —
                // the exact line may not be highlightable at all (SmartDiffViewer
                // only renders unified-diff HUNKS, so a blast-radius caller's
                // line frequently falls outside every hunk); without this, a
                // click that can't resolve to a line produced ZERO visible
                // feedback beyond a scroll, which read as "highlight is broken".
                key={isTargetFile ? `${fileIdx}:${file.path}:${targetNonce}` : `${fileIdx}:${file.path}`}
                data-file-path={file.path}
                style={{ ...s.fileCard, ...(isTargetFile ? s.fileCardTarget : undefined) }}
              >
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
                  <Icon.ChevronRight
                    size={13}
                    style={{
                      color: "var(--text-muted)",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform .12s",
                      flexShrink: 0,
                    }}
                  />
                  <Icon.FileText size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={s.filePath} title={file.path} className="mono">
                    {file.path}
                  </span>
                  {file.findings.length > 0 && (
                    <span
                      style={s.findingDot}
                      title={`${file.findings.length} finding(s)`}
                    />
                  )}
                  <div style={s.fileCardHeaderRight}>
                    {(hasPatch || file.pseudocode_summary != null) && (() => {
                      const isGeneratingThis =
                        generateSummary.isPending && generateSummary.variables === file.path;
                      return (
                        <button
                          type="button"
                          style={s.summaryButton}
                          disabled={isGeneratingThis}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (file.pseudocode_summary != null) {
                              setSummaryVisible((prev) => ({
                                ...prev,
                                [file.path]: !isSum,
                              }));
                            } else {
                              generateSummary.mutate(file.path);
                            }
                          }}
                          aria-label={
                            file.pseudocode_summary != null
                              ? `summary for ${file.path}`
                              : `generate summary for ${file.path}`
                          }
                        >
                          <Icon.Sparkles size={11} />
                          {isGeneratingThis
                            ? t("smartDiff.generatingSummary")
                            : file.pseudocode_summary != null
                              ? t("smartDiff.summary")
                              : t("smartDiff.generateSummary")}
                        </button>
                      );
                    })()}
                    <span style={s.diffBadge} className="mono tnum">
                      <span style={s.diffBadgeAdd}>+{file.additions}</span>{" "}
                      <span style={s.diffBadgeDel}>−{file.deletions}</span>
                    </span>
                  </div>
                </div>
                {isExpanded && file.pseudocode_summary != null && isSum && (
                  <div style={s.summaryText}>
                    <Icon.Sparkles size={13} style={s.summaryIcon} />
                    <span>
                      <b style={s.summaryLabel}>{t("smartDiff.whatThisDoes")} </b>
                      {file.pseudocode_summary}
                    </span>
                  </div>
                )}
                {hasPatch && isExpanded && (
                  <FileCardBody
                    file={file}
                    onFindingClick={onFindingClick}
                    targetLine={file.path === targetFile ? targetLine : undefined}
                    targetNonce={targetNonce}
                  />
                )}
                {isExpanded && isTargetFile && lineContext != null && lineContext.file === targetFile && (
                  <LineContextBlock ctx={lineContext} targetLine={targetLine} targetNonce={targetNonce} />
                )}
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

  // Blast Radius caller lines are indexed against the repo's default branch
  // (never a PR's own head — see translateLine.ts), so when the target
  // file is ALSO touched by this PR, an earlier hunk can shift every line
  // below it. Translate once, using that file's own patch, before this
  // line number is used for anything (DOM lookup, the context-fetch
  // fallback, or rendering) — every downstream usage reads the translated
  // value, never the raw prop.
  const targetFilePatch = React.useMemo(() => {
    if (!targetFile || !data) return undefined;
    for (const group of data.groups) {
      const file = group.files.find((f) => f.path === targetFile);
      if (file) return file.patch;
    }
    return undefined;
  }, [data, targetFile]);

  const effectiveTargetLine = React.useMemo(
    () => (targetLine != null ? translateBaseLineToHead(targetFilePatch, targetLine) : targetLine),
    [targetFilePatch, targetLine],
  );
  // Set once `tryScroll` confirms the target line isn't in the DOM for the
  // CURRENT target (file+line+nonce) — gates `useLineContext` below so we
  // only fetch when the line genuinely can't be found, not on every render.
  const [lineMissing, setLineMissing] = useState<{
    file: string;
    line: number;
    nonce: number;
  } | null>(null);

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
    // The exact line can genuinely never appear in a rendered HUNK:
    // SmartDiffViewer's `file.patch` only carries the hunks GitHub returned
    // (a few lines of context around each change), not the full file — a
    // blast-radius caller's line can fall well outside every shown hunk.
    // Scroll to the file immediately as a fallback, report the line missing
    // (which triggers `useLineContext` to fetch a window of real file
    // content around it), then keep watching: once that fetched context
    // block mounts its own `[data-line-no]` markers, this same retry loop
    // finds and scrolls to it like any other line — never regress to
    // "opens but doesn't move".
    let scrolledToFileOnce = false;
    let reportedMissing = false;
    const tryScroll = (): boolean => {
      const fileEl = Array.from(scope.querySelectorAll("[data-file-path]")).find(
        (el) => el.getAttribute("data-file-path") === targetFile,
      );
      if (!fileEl) return false;
      const lineEl =
        effectiveTargetLine != null
          ? Array.from(fileEl.querySelectorAll("[data-line-no]")).find(
              (el) => el.getAttribute("data-line-no") === String(effectiveTargetLine),
            )
          : undefined;
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
        setLineMissing(null);
        return true;
      }
      if (!scrolledToFileOnce) {
        scrolledToFileOnce = true;
        fileEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (effectiveTargetLine != null && !reportedMissing) {
        reportedMissing = true;
        setLineMissing({ file: targetFile, line: effectiveTargetLine, nonce: targetNonce ?? 0 });
      }
      // Keep watching (unless there was no line request at all, in which
      // case scrolling to the file already satisfied the request).
      return effectiveTargetLine == null;
    };

    if (tryScroll()) return;

    const observer = new MutationObserver(() => {
      if (tryScroll()) observer.disconnect();
    });
    observer.observe(scope, { childList: true, subtree: true });
    // Safety cap so a stale observer never lingers if the target line
    // genuinely never appears anywhere (including the fetched context
    // block — e.g. the line-context request itself 404s). Generous enough
    // to cover the useLineContext round trip, not just hunk rendering.
    const timeout = setTimeout(() => observer.disconnect(), 8000);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [targetFile, effectiveTargetLine, targetNonce, data, isLoading]);

  const missingActive =
    targetFile != null &&
    effectiveTargetLine != null &&
    lineMissing != null &&
    lineMissing.file === targetFile &&
    lineMissing.line === effectiveTargetLine &&
    lineMissing.nonce === (targetNonce ?? 0);

  // Keep the query key stable on the current target regardless of
  // `missingActive` — only `enabled` should gate fetching. Nulling
  // file/line when `missingActive` flips back to false (which happens as
  // soon as the fetched block mounts and the scroll effect above marks it
  // found) would swap the cache key and drop the just-fetched data,
  // unmounting the block that had just appeared.
  const { data: lineContext } = useLineContext(prId, targetFile, effectiveTargetLine, missingActive);

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
          prId={prId}
          role={group.role}
          files={group.files}
          defaultExpanded={group.role !== "boilerplate"}
          tFiles={tFiles}
          t={t}
          targetFile={targetFile}
          targetLine={effectiveTargetLine}
          targetNonce={targetNonce}
          lineContext={lineContext}
          onFindingClick={onFindingClick}
        />
      ))}
    </div>
  );
}
