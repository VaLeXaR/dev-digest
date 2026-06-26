"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useIntent, useRecalculateIntent } from "../../../../../../../lib/hooks/brief";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const { data: intentData, isLoading: intentLoading } = useIntent(prId);
  const recalcMutation = useRecalculateIntent();

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
                <p style={s.intentSummary}>{intentData.intent}</p>
              )}

              {intentData.in_scope.length > 0 && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.inScope")}</div>
                  <div style={s.chipRow}>
                    {intentData.in_scope.map((item: string) => (
                      <span key={item} style={s.chipIn}>{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {intentData.out_of_scope.length > 0 && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.outOfScope")}</div>
                  <div style={s.chipRow}>
                    {intentData.out_of_scope.map((item: string) => (
                      <span key={item} style={s.chipOut}>{item}</span>
                    ))}
                  </div>
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
