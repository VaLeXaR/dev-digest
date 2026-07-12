"use client";

import React, { useMemo } from "react";
import { Icon } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { PrWhyRiskBriefRecord } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";
import { s } from "./styles";

interface PrBriefCardProps {
  briefData: PrWhyRiskBriefRecord | undefined;
  briefLoading: boolean;
  onGoToDiff: (file: string, line: number) => void;
  changedFiles: string[];
  repoFullName?: string | null;
  headSha?: string | null;
}

const ReviewFocusIcon = Icon.ListChecks;

/** Review-focus list only — what/why/risk_level moved into PrBriefBanner
 * (top of Overview), risks[] was dropped entirely (product decision:
 * IntentCard's own RISK AREAS already covers this, a second independent
 * risk list read as confusing). */
export function PrBriefCard({
  briefData,
  briefLoading,
  onGoToDiff,
  changedFiles,
  repoFullName,
  headSha,
}: PrBriefCardProps) {
  const t = useTranslations("brief");
  const changedFileSet = useMemo(() => new Set(changedFiles), [changedFiles]);

  if (briefLoading || !briefData || briefData.review_focus.length === 0) return null;

  return (
    <div style={s.card}>
      <div style={s.reviewFocusLabel}>
        <ReviewFocusIcon size={13} />
        {t("card.reviewFocus.title")}
        <span style={s.countBadge}>{briefData.review_focus.length}</span>
      </div>
      <div style={s.reviewFocusList}>
        {briefData.review_focus.map((item, index) => {
          const inDiff = changedFileSet.has(item.file);
          const label = item.line != null ? `${item.file}:${item.line}` : item.file;
          const rowContent = (
            <>
              <span style={s.reviewFocusGlyph}>{"▸"}</span>
              <span style={s.reviewFocusPath} className="mono">
                {label}
              </span>
              <span style={s.reviewFocusDash}>{"—"}</span>
              <span style={s.reviewFocusReason}>{item.reason}</span>
            </>
          );

          if (inDiff) {
            return (
              <button
                key={index}
                type="button"
                style={s.reviewFocusRow}
                onClick={() => onGoToDiff(item.file, item.line ?? 0)}
                aria-label={t("card.reviewFocus.goto", {
                  file: item.file,
                  line: item.line ?? 0,
                })}
              >
                {rowContent}
              </button>
            );
          }

          // Not part of this PR's diff — open on GitHub instead, when
          // we have enough to build the link; otherwise render plain
          // (non-interactive) rather than a dead button/link.
          const href =
            repoFullName && headSha
              ? githubBlobUrl(repoFullName, headSha, item.file, item.line)
              : undefined;
          if (!href) {
            return (
              <div key={index} style={s.reviewFocusRow}>
                {rowContent}
              </div>
            );
          }
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={s.reviewFocusRow}
              aria-label={t("card.reviewFocus.gotoExternal", {
                file: item.file,
                line: item.line ?? 0,
              })}
            >
              {rowContent}
            </a>
          );
        })}
      </div>
    </div>
  );
}
