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

const SEVERITY_BADGE: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "blocker", color: "var(--error)" },
  WARNING: { label: "warning", color: "var(--warn)" },
  SUGGESTION: { label: "suggestion", color: "var(--accent-text)" },
};

function FileCardBody({ file }: { file: SmartDiffFile }) {
  const diffLines = parsePatch(file.patch);
  if (diffLines.length === 0) return null;

  return (
    <div style={s.diffBlock}>
      {diffLines.map((line, i) => {
        const badge =
          line.type === "+" && line.lineNo != null
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
              })
            : null;

        return (
          <div key={i} style={{ ...s.diffLine, ...lineBg }}>
            <span style={s.lineNo}>
              {line.lineNo != null ? line.lineNo : " "}
            </span>
            <span style={{ ...s.lineSign, ...signColor }}>{line.type}</span>
            <span style={s.lineContent}>{line.content}</span>
            {badgeMeta != null && (
              <span
                style={{ ...s.severityBadge, background: badgeMeta.color }}
              >
                {badgeMeta.label}
              </span>
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
}: {
  role: SmartDiffRole;
  files: SmartDiffFile[];
  defaultExpanded: boolean;
  tFiles: (count: number) => string;
  t: ReturnType<typeof useTranslations<"prReview">>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(
    {},
  );

  const roleLabel =
    role === "core"
      ? t("smartDiff.coreLabel")
      : role === "wiring"
        ? t("smartDiff.wiringLabel")
        : t("smartDiff.boilerplateLabel");

  function toggleFile(path: string) {
    setExpandedFiles((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }));
  }

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
          {files.map((file) => {
            const isFileExpanded = expandedFiles[file.path] ?? true;
            const hasPatch = file.patch != null && file.patch.length > 0;

            return (
              <div key={file.path} style={s.fileCard}>
                <div style={s.fileCardHeader}>
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
                      onClick={() => toggleFile(file.path)}
                      aria-label={`summary for ${file.path}`}
                    >
                      {t("smartDiff.summary")}
                    </button>
                  )}
                </div>
                {hasPatch && isFileExpanded && <FileCardBody file={file} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SmartDiffViewer({ prId }: SmartDiffViewerProps) {
  const t = useTranslations("prReview");
  const { data, isLoading } = useSmartDiff(prId);

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

  // Compute totals during render (not state)
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
    <div style={s.viewerRoot}>
      <SectionLabel icon="GitBranch">
        {t("smartDiff.reviewerOrderedDiff")}
      </SectionLabel>

      <p style={s.statsLine}>
        {t("smartDiff.statsLine", {
          files: totalFiles,
          additions: totalAdditions,
          deletions: totalDeletions,
        })}
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
        />
      ))}
    </div>
  );
}
