"use client";

import React, { useState } from "react";
import { Skeleton, SectionLabel } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useSmartDiff } from "@/lib/hooks";
import type { SmartDiffRole } from "@devdigest/shared";
import { s } from "./styles";

interface SmartDiffViewerProps {
  prId: string;
  repoFullName: string | null;
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

function GroupSection({
  role,
  files,
  defaultExpanded,
  repoFullName,
  prNumber,
  tFiles,
  tFindings,
}: {
  role: SmartDiffRole;
  files: import("@devdigest/shared").SmartDiffFile[];
  defaultExpanded: boolean;
  repoFullName: string | null;
  prNumber: string;
  tFiles: (count: number) => string;
  tFindings: (count: number) => string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const router = useRouter();
  const t = useTranslations("prReview");

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
          {files.map((file) => {
            const hasFindingLines = file.finding_lines.length > 0;
            return (
              <div key={file.path} style={s.fileCard}>
                <span style={s.filePath} title={file.path}>
                  {file.path}
                </span>
                <span style={s.diffBadge}>
                  +{file.additions} -{file.deletions}
                </span>
                {hasFindingLines && (
                  <button
                    style={s.findingsBadge}
                    aria-label={`${file.finding_lines.length} findings in ${file.path}`}
                    onClick={() => {
                      if (repoFullName) {
                        router.push(
                          `/repos/${repoFullName}/pulls/${prNumber}?tab=findings`,
                        );
                      }
                    }}
                  >
                    {tFindings(file.finding_lines.length)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SmartDiffViewer({ prId, repoFullName }: SmartDiffViewerProps) {
  const t = useTranslations("prReview");
  const params = useParams();
  const prNumber = params["number"] as string;
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

  const hasContent = data && data.groups.length > 0 && data.groups.some((g) => g.files.length > 0);

  if (!hasContent) {
    return <p style={s.emptyText}>{t("smartDiff.groupedByRole")}</p>;
  }

  const tFiles = (count: number) => t("smartDiff.filesCount", { count });
  const tFindings = (count: number) => t("smartDiff.findingLines", { count });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel icon="GitBranch">{t("smartDiff.groupedByRole")}</SectionLabel>

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
          repoFullName={repoFullName}
          prNumber={prNumber}
          tFiles={tFiles}
          tFindings={tFindings}
        />
      ))}
    </div>
  );
}
