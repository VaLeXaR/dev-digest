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
  useBlast,
  useGenerateBlastSummary,
  useBrief,
  useGenerateBrief,
} from "../../../../../../../lib/hooks";
import { FEATURE_MODELS, PROVIDER_LABELS } from "../../../../../../../lib/feature-models";
import { notify } from "../../../../../../../lib/toast";
import type { SecretsStatus } from "@devdigest/shared";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { PrBriefCard } from "./_components/PrBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
  onGoToDiff: (file: string, line: number) => void;
  /** Paths actually changed in this PR — a blast-radius caller can be OUTSIDE
   * this list (that's the point of blast radius: showing impact beyond the
   * diff), so BlastRadiusCard needs it to decide in-app jump vs external
   * GitHub link. */
  changedFiles: string[];
  repoFullName?: string | null;
  headSha?: string | null;
}

export function OverviewTab({
  prBody,
  prId,
  onGoToDiff,
  changedFiles,
  repoFullName,
  headSha,
}: OverviewTabProps) {
  const t = useTranslations("prReview");
  const tBlast = useTranslations("blast");
  const { data: intentData, isLoading: intentLoading } = useIntent(prId);
  const recalcMutation = useRecalculateIntent();
  const { data: risksData, isLoading: risksLoading } = useRisks(prId);
  const { data: secretsStatus } = useSecretsStatus();
  const { data: settings } = useSettings();
  const { data: blastData, isLoading: blastLoading } = useBlast(prId);
  const explainMutation = useGenerateBlastSummary();
  const { data: briefData, isLoading: briefLoading } = useBrief(prId);
  const generateBrief = useGenerateBrief();

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

  const handleExplain = () => explainMutation.mutate(prId);

  const explainButton = (
    <Button
      kind="secondary"
      size="sm"
      icon="Sparkles"
      loading={explainMutation.isPending}
      onClick={handleExplain}
    >
      {explainMutation.isPending ? tBlast("explain.loading") : tBlast("explain.button")}
    </Button>
  );

  const regenerateButton = (
    <Button
      kind="secondary"
      size="sm"
      icon="RefreshCw"
      loading={generateBrief.isPending}
      onClick={() => generateBrief.mutate(prId)}
    >
      {t("intent.generateRisks")}
    </Button>
  );

  return (
    <>
      <div style={s.gridTwoCol} data-testid="overview-grid">
        {!intentLoading && (
          <IntentCard
            intentData={intentData}
            risksData={risksData}
            risksLoading={risksLoading}
            recalcButton={recalcButton}
          />
        )}

        <BlastRadiusCard
          blastData={blastData}
          blastLoading={blastLoading}
          onGoToDiff={onGoToDiff}
          explainButton={explainButton}
          changedFiles={changedFiles}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      </div>

      <PrBriefCard
        briefData={briefData}
        briefLoading={briefLoading}
        regenerateButton={regenerateButton}
        onGoToDiff={onGoToDiff}
        changedFiles={changedFiles}
        repoFullName={repoFullName}
        headSha={headSha}
      />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
