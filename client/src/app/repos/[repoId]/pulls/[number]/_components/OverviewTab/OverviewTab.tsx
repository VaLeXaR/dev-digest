"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import {
  useIntent,
  useRecalculateIntent,
  useRisks,
  useSecretsStatus,
  useSettings,
} from "../../../../../../../lib/hooks";
import { FEATURE_MODELS, PROVIDER_LABELS } from "../../../../../../../lib/feature-models";
import { notify } from "../../../../../../../lib/toast";
import type { SecretsStatus } from "@devdigest/shared";
import { IntentCard } from "./_components/IntentCard";
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
  const { data: secretsStatus } = useSecretsStatus();
  const { data: settings } = useSettings();

  const handleRecalculate = () => {
    if (secretsStatus) {
      for (const featureId of ["review_intent", "risk_brief"] as const) {
        const feature = FEATURE_MODELS.find((f) => f.id === featureId);
        if (!feature) continue;
        const provider = (settings?.feature_models?.[featureId]?.provider ??
          feature.defaultProvider) as keyof SecretsStatus;
        if (!secretsStatus[provider]) {
          notify.error(
            `${feature.label} requires a ${PROVIDER_LABELS[provider] ?? provider} API key — configure it in Settings → API Keys`,
          );
          if (featureId === "review_intent") return;
        }
      }
    }
    recalcMutation.mutate(prId);
  };

  const recalcButton = (
    <Button
      kind="secondary"
      size="sm"
      icon="RefreshCw"
      loading={recalcMutation.isPending}
      onClick={handleRecalculate}
    >
      {t("intent.recalculate")}
    </Button>
  );

  return (
    <>
      {!intentLoading && (
        <IntentCard
          intentData={intentData}
          risksData={risksData}
          risksLoading={risksLoading}
          recalcButton={recalcButton}
        />
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
