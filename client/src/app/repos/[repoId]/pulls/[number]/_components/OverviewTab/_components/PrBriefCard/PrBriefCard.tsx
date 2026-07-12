"use client";

import React, { useMemo, useState } from "react";
import { SectionLabel, Icon } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { PrWhyRiskBriefRecord, RiskSeverity } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";
import { s } from "./styles";

interface PrBriefCardProps {
  briefData: PrWhyRiskBriefRecord | undefined;
  briefLoading: boolean;
  /** Built by OverviewTab (owns the useGenerateBrief mutation) — mirrors
   * IntentCard's recalcButton / BlastRadiusCard's explainButton. Doubles as
   * the first-generate action (empty state) and the regenerate action. */
  regenerateButton: React.ReactNode;
  onGoToDiff: (file: string, line: number) => void;
  changedFiles: string[];
  repoFullName?: string | null;
  headSha?: string | null;
}

const ChevronRightIcon = Icon.ChevronRight;
const ChevronDownIcon = Icon.ChevronDown;
const ReviewFocusIcon = Icon.ListChecks;

// Severity icon/style pattern copied from IntentCard (RISK_ICON/RISK_STYLE,
// IntentCard.tsx:17-27) — copied, not imported, to keep this card independent
// of IntentCard's module (AC-17).
const RISK_ICON: Record<RiskSeverity, IconName> = {
  high: "AlertOctagon",
  medium: "AlertTriangle",
  low: "Lightbulb",
};

const RISK_LEVEL_STYLE: Record<RiskSeverity, React.CSSProperties> = {
  high: s.riskLevelChipHigh,
  medium: s.riskLevelChipMedium,
  low: s.riskLevelChipLow,
};

const RISK_ROW_STYLE: Record<RiskSeverity, React.CSSProperties> = {
  high: s.riskRowHigh,
  medium: s.riskRowMedium,
  low: s.riskRowLow,
};

export function PrBriefCard({
  briefData,
  briefLoading,
  regenerateButton,
  onGoToDiff,
  changedFiles,
  repoFullName,
  headSha,
}: PrBriefCardProps) {
  const t = useTranslations("brief");
  const changedFileSet = useMemo(() => new Set(changedFiles), [changedFiles]);
  // Rows the user has toggled open, keyed by array index (not risk.title —
  // titles are LLM-generated free text and aren't guaranteed unique; see the
  // 2026-07-02 BlastRadiusCard entry in client/INSIGHTS.md for the same
  // symbol-name-collision reasoning).
  const [expandedRisks, setExpandedRisks] = useState<Set<number>>(new Set());

  const toggleRisk = (index: number) => {
    setExpandedRisks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const RiskLevelIcon = briefData ? Icon[RISK_ICON[briefData.risk_level]] : null;

  return (
    <div style={s.card}>
      <SectionLabel icon="FileText" right={regenerateButton}>
        {t("card.title")}
      </SectionLabel>

      {!briefLoading &&
        (!briefData ? (
          <p style={s.emptyText}>{t("card.empty")}</p>
        ) : (
          <>
            {/* 1. Header: risk_level chip left of what/why (AC-9). */}
            {(briefData.what || briefData.why) && (
              <div style={s.headerContent}>
                {RiskLevelIcon && (
                  <span style={RISK_LEVEL_STYLE[briefData.risk_level]}>
                    <RiskLevelIcon size={13} />
                    {t(`card.riskLevel.${briefData.risk_level}`)}
                  </span>
                )}
                <div style={s.whatWhy}>
                  {briefData.what && <p style={s.what}>{briefData.what}</p>}
                  {briefData.why && <p style={s.why}>{briefData.why}</p>}
                </div>
              </div>
            )}

            {/* 2. risks[] — own list, independent of IntentCard's RISK AREAS (AC-17). */}
            {briefData.risks.length > 0 && (
              <div style={s.riskSection}>
                <div style={s.riskSectionLabel}>{t("card.risks.title")}</div>
                <div style={s.riskList}>
                  {briefData.risks.map((risk, index) => {
                    const hasRefs = risk.file_refs.length > 0;
                    const open = expandedRisks.has(index);
                    const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
                    const RiskIcon = Icon[RISK_ICON[risk.severity]];
                    return (
                      <div key={index} style={RISK_ROW_STYLE[risk.severity]}>
                        <div style={s.riskRowHeader}>
                          <RiskIcon size={13} />
                          <span style={s.riskTitle}>{risk.title}</span>
                          {hasRefs ? (
                            <>
                              <span style={s.riskFileRefs}>
                                {risk.file_refs.map((file, refIndex) => {
                                  const isLast = refIndex === risk.file_refs.length - 1;
                                  const inDiff = changedFileSet.has(file);
                                  let refEl: React.ReactNode;
                                  if (inDiff) {
                                    refEl = (
                                      <button
                                        type="button"
                                        style={s.riskFileRefLink}
                                        className="mono"
                                        onClick={() => onGoToDiff(file, 0)}
                                        aria-label={t("card.risks.goto", { file })}
                                      >
                                        {file}
                                      </button>
                                    );
                                  } else {
                                    const href =
                                      repoFullName && headSha
                                        ? githubBlobUrl(repoFullName, headSha, file)
                                        : undefined;
                                    refEl = href ? (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={s.riskFileRefLink}
                                        className="mono"
                                        aria-label={t("card.risks.gotoExternal", { file })}
                                      >
                                        {file}
                                      </a>
                                    ) : (
                                      <span className="mono">{file}</span>
                                    );
                                  }
                                  return (
                                    <React.Fragment key={refIndex}>
                                      {refEl}
                                      {!isLast && ", "}
                                    </React.Fragment>
                                  );
                                })}
                              </span>
                              <button
                                type="button"
                                style={s.riskChevronBtn}
                                onClick={() => toggleRisk(index)}
                                aria-expanded={open}
                                aria-label={t("card.risks.toggle", { title: risk.title })}
                              >
                                <Chevron size={14} />
                              </button>
                            </>
                          ) : (
                            <span style={s.riskUnlinked}>{t("card.risks.unlinked")}</span>
                          )}
                        </div>
                        {hasRefs
                          ? open && <p style={s.riskExplanation}>{risk.explanation}</p>
                          : risk.explanation && <p style={s.riskExplanation}>{risk.explanation}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. review_focus[] sub-section — innermost, matches the mockup's
                bottom position (AC-16, not a separate card). */}
            {briefData.review_focus.length > 0 && (
              <div style={s.reviewFocusSection}>
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
            )}
          </>
        ))}
    </div>
  );
}
