"use client";

import React from "react";
import { SectionLabel, Icon } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { PrIntentRecord, Risks, RiskSeverity } from "@devdigest/shared";
import { s } from "./styles";

interface IntentCardProps {
  intentData: PrIntentRecord | undefined;
  risksData: Risks | undefined;
  risksLoading: boolean;
  recalcButton: React.ReactNode;
}

const RISK_ICON: Record<RiskSeverity, IconName> = {
  high: "AlertOctagon",
  medium: "AlertTriangle",
  low: "Lightbulb",
};

const RISK_STYLE: Record<RiskSeverity, React.CSSProperties> = {
  high: s.riskChipHigh,
  medium: s.riskChipMedium,
  low: s.riskChipLow,
};

export function IntentCard({ intentData, risksData, risksLoading, recalcButton }: IntentCardProps) {
  const t = useTranslations("prReview");

  const CheckIcon = Icon["Check"];
  const XIcon = Icon["X"];

  return (
    <div style={s.card}>
      <SectionLabel icon="Target" right={recalcButton}>
        {t("intent.title")}
      </SectionLabel>

      {intentData ? (
        <>
          {intentData.intent && (
            <p style={s.summary}>{String.fromCharCode(34)}{intentData.intent}{String.fromCharCode(34)}</p>
          )}

          {(intentData.in_scope.length > 0 || intentData.out_of_scope.length > 0) && (
            <div style={s.scopeGrid}>
              <div style={s.scopeColumn}>
                <div style={s.scopeColumnHeaderIn}>
                  <CheckIcon size={12} />
                  {t("intent.inScope")}
                </div>
                <ul style={s.scopeList}>
                  {intentData.in_scope.map((item) => (
                    <li key={item} style={s.scopeItem}>
                      <span style={s.scopeItemBullet}>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={s.scopeColumn}>
                <div style={s.scopeColumnHeaderOut}>
                  <XIcon size={12} />
                  {t("intent.outOfScope")}
                </div>
                <ul style={s.scopeList}>
                  {intentData.out_of_scope.map((item) => (
                    <li key={item} style={s.scopeItem}>
                      <span style={s.scopeItemBullet}>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!risksLoading && (
            <div style={s.riskGroup}>
              <div style={s.riskGroupLabel}>{t("intent.riskAreas")}</div>
              {risksData && risksData.risks.length > 0 ? (
                <div style={s.riskRow}>
                  {risksData.risks.map((risk) => {
                    const RiskIcon = Icon[RISK_ICON[risk.severity]];
                    return (
                      <span key={risk.title} style={RISK_STYLE[risk.severity]}>
                        <RiskIcon size={12} />
                        {risk.title}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p style={s.emptyText}>{t("intent.emptyRisks")}</p>
              )}
            </div>
          )}
        </>
      ) : (
        <p style={s.emptyText}>{t("intent.empty")}</p>
      )}
    </div>
  );
}
