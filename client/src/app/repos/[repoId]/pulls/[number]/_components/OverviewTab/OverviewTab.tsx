"use client";

import React from "react";
import { SectionLabel, Button, Icon } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useIntent, useRecalculateIntent, useRisks } from "../../../../../../../lib/hooks/brief";
import type { RiskSeverity } from "@devdigest/shared";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const { data: intentData, isLoading: intentLoading } = useIntent(prId);
  const recalcMutation = useRecalculateIntent();
  const { data: risksData, isLoading: risksLoading } = useRisks(prId);

  const RISK_ICON: Record<RiskSeverity, IconName> = {
    high: "AlertOctagon",
    medium: "AlertTriangle",
    low: "Lightbulb",
  };

  const RISK_STYLE: Record<RiskSeverity, React.CSSProperties> = {
    high: s.chipRiskHigh,
    medium: s.chipRiskMedium,
    low: s.chipRiskLow,
  };

  const CheckIcon = Icon["Check"];
  const XIcon = Icon["X"];

  const recalcButton = (
    <Button
      kind="secondary"
      size="sm"
      icon="RefreshCw"
      loading={recalcMutation.isPending}
      onClick={() => recalcMutation.mutate(prId)}
    >
      {t("intent.recalculate")}
    </Button>
  );

  return (
    <>
      {/* Intent section */}
      {!intentLoading && (
        <section style={s.intentSection}>
          <SectionLabel icon="Target" right={recalcButton}>
            {t("intent.title")}
          </SectionLabel>

          {intentData ? (
            <>
              {intentData.intent && (
                <p style={s.intentSummary}>{String.fromCharCode(34)}{intentData.intent}{String.fromCharCode(34)}</p>
              )}

              {intentData.in_scope.length > 0 && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.inScope")}</div>
                  <div style={s.chipRow}>
                    {intentData.in_scope.map((item: string) => (
                      <span key={item} style={s.chipIn}>
                        <CheckIcon size={12} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {intentData.out_of_scope.length > 0 && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.outOfScope")}</div>
                  <div style={s.chipRow}>
                    {intentData.out_of_scope.map((item: string) => (
                      <span key={item} style={s.chipOut}>
                        <XIcon size={12} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk areas section */}
              {!risksLoading && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.riskAreas")}</div>
                  {risksData && risksData.risks.length > 0 ? (
                    <div style={s.chipRow}>
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
                    <p style={s.emptyIntentText}>{t("intent.emptyRisks")}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p style={s.emptyIntentText}>{t("intent.empty")}</p>
          )}
        </section>
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
