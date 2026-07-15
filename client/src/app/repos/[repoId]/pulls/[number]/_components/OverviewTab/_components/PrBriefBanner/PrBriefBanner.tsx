"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";
import { formatCost } from "../../../RunTraceDrawer/helpers";
import { s } from "./styles";

/** "8.2K→1.3K" — one decimal + capital K on both sides, per
 * design/01-overview-pr-brief.png's PR Brief banner (distinct from
 * RunTraceDrawer's lowercase "8k→1.3k" per-run trace stat format). */
function formatTokensCompact(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(1)}K→${(tokensOut / 1000).toFixed(1)}K`;
}

// Icon/color per risk_level — same values PrBriefCard's risk_level chip used
// before this banner absorbed it (crit/warn/neutral), kept independent of
// IntentCard's own RISK_ICON copy (AC-17 precedent: duplicate, don't import).
const RISK_META: Record<RiskSeverity, { c: string; bg: string; icon: IconName }> = {
  high: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon" },
  medium: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle" },
  low: { c: "var(--text-secondary)", bg: "var(--bg-hover)", icon: "Lightbulb" },
};

/**
 * Top-of-Overview PR Brief banner. Its icon/color/label and the what/why text
 * always come from the generated Why & Risk Brief (`risk_level`/`what`/`why`)
 * — the ONLY thing this component renders unconditionally, since by the time
 * OverviewTab shows the populated layout a brief is guaranteed to exist.
 * findings/blockers/score/cost/tokens are separate, OPTIONAL enrichment from
 * the latest agent review/run — a brief can exist before any review ever ran
 * (e.g. right after "Generate brief" with no prior "Run Review"), in which
 * case those are simply omitted rather than blocking the banner.
 *
 * Distinct from `VerdictBanner` (`../../VerdictBanner`), which renders ONE
 * agent RUN's own verdict inside `ReviewRunAccordion` (Findings tab) — that
 * component's data model (verdict enum) doesn't fit this banner's risk_level
 * model, so they're kept as two components rather than one overloaded prop
 * contract.
 */
export function PrBriefBanner({
  riskLevel,
  what,
  why,
  findingsCount,
  blockers,
  score,
  costUsd,
  tokensIn,
  tokensOut,
}: {
  riskLevel: RiskSeverity;
  what: string;
  why: string;
  findingsCount?: number | null;
  blockers?: number | null;
  score?: number | null;
  costUsd?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const t = useTranslations("prReview");
  const tBrief = useTranslations("brief");
  const meta = RISK_META[riskLevel];
  const RiskIcon = Icon[meta.icon];

  return (
    <div style={s.wrap}>
      <div style={s.iconBox(meta.bg, meta.c)}>
        <RiskIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(meta.c)}>{tBrief(`card.riskLevel.${riskLevel}`)}</span>
          {findingsCount != null && (
            <Badge color="var(--text-secondary)">
              {t("verdict.findingsCount", { count: findingsCount })}
              {blockers && blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
            </Badge>
          )}
          <span title={t("prBrief.sourceTooltip")} style={s.sourceHint}>
            <Icon.Info size={13} />
          </span>
        </div>
        {what && <p style={s.what}>{what}</p>}
        {why && <p style={s.why}>{why}</p>}
      </div>
      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
          {costUsd != null && tokensIn != null && tokensOut != null && (
            <span style={s.scoreMeta}>
              <Icon.DollarSign size={11} />
              <span className="mono tnum" title={t("prBrief.costTooltip")} style={s.scoreMetaText}>
                {formatCost(costUsd)}
                <span style={s.scoreMetaTokens}>{formatTokensCompact(tokensIn, tokensOut)}</span>
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
