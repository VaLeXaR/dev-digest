"use client";

import React from "react";
import { SectionLabel, Button, Icon, Card } from "@devdigest/ui";
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
import type { ReviewRecord, SecretsStatus } from "@devdigest/shared";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { PrBriefCard } from "./_components/PrBriefCard";
import { PrBriefBanner } from "./_components/PrBriefBanner";
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
  /** Latest review with a verdict (kind='review') — backs the top PR Brief
   * banner's verdict icon + summary text. Null until the PR has been reviewed. */
  latestReview?: ReviewRecord | null;
  /** Latest-review score, last-completed-run cost/tokens, and cumulative
   * per-severity finding counts — same aggregates the PR list shows, echoed
   * on `PrDetail` (server/src/modules/pulls/routes.ts:computePrAggregates). */
  score?: number | null;
  findingsCounts?: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
  lastRunCostUsd?: number | null;
  lastRunTokensIn?: number | null;
  lastRunTokensOut?: number | null;
}

export function OverviewTab({
  prBody,
  prId,
  onGoToDiff,
  changedFiles,
  repoFullName,
  headSha,
  latestReview,
  score,
  findingsCounts,
  lastRunCostUsd,
  lastRunTokensIn,
  lastRunTokensOut,
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

  // Single entry point for the empty state's "Generate brief" action — no
  // per-card Recalculate/Generate buttons anymore (product decision, matches
  // design/01-overview-pr-brief.png's BriefEmpty screen: one button populates
  // Intent, Why & Risk Brief, and Review Focus together). Intent is recalculated
  // FIRST and awaited — WhyRiskBriefService.generate() reads intent as an
  // already-persisted derived fact (server/src/modules/why-risk-brief/service.ts:57)
  // rather than generating it itself, so brief generation would see a null
  // intent input if the two mutations ran concurrently or brief-first.
  const handleGenerate = async () => {
    if (secretsStatus) {
      for (const featureId of ["review_intent", "risk_brief", "why_risk_brief"] as const) {
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
    try {
      await recalcMutation.mutateAsync(prId);
      await generateBrief.mutateAsync(prId);
    } catch {
      notify.error("Failed to generate the brief — check your LLM provider configuration and try again.");
    }
  };
  const generating = recalcMutation.isPending || generateBrief.isPending;

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

  const findingsTotal = findingsCounts
    ? findingsCounts.CRITICAL + findingsCounts.WARNING + findingsCounts.SUGGESTION
    : 0;

  // Gated on the BRIEF alone (not intent) — PrBriefCard no longer has its own
  // regenerate button, so an intent-but-no-brief PR (common: Intent shipped
  // weeks before Why & Risk Brief existed, so most PRs already have intent
  // data) must still show the unified CTA, not PrBriefCard's dead internal
  // empty text with nothing to click. Blast Radius is intentionally included
  // in this same gate (product decision: hide everything until first
  // generate, matching the mockup's BriefEmpty screen literally) even though
  // BlastRadiusCard's own data doesn't actually depend on Intent/Brief generation.
  const isEmpty = !briefLoading && !briefData;

  return (
    <>
      {isEmpty ? (
        <Card style={s.emptyCard}>
          <div style={s.emptyInner}>
            <div style={s.emptyIconBox}>
              <Icon.FileText size={24} style={{ color: "var(--text-muted)" }} />
            </div>
            <div style={s.emptyTitle}>{t("prBrief.empty.title")}</div>
            <p style={s.emptyDescription}>{t("prBrief.empty.description")}</p>
            <Button kind="primary" icon="FileText" loading={generating} onClick={handleGenerate}>
              {t("prBrief.empty.button")}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {briefData && (
            <section>
              <SectionLabel icon="FileText">{t("prBrief.title")}</SectionLabel>
              <PrBriefBanner
                riskLevel={briefData.risk_level}
                what={briefData.what}
                why={briefData.why}
                findingsCount={latestReview ? findingsTotal : undefined}
                blockers={latestReview ? (findingsCounts?.CRITICAL ?? 0) : undefined}
                score={latestReview ? (score ?? null) : undefined}
                costUsd={latestReview ? lastRunCostUsd : undefined}
                tokensIn={latestReview ? lastRunTokensIn : undefined}
                tokensOut={latestReview ? lastRunTokensOut : undefined}
              />
            </section>
          )}

          <div style={s.gridTwoCol} data-testid="overview-grid">
            {!intentLoading && (
              <IntentCard intentData={intentData} risksData={risksData} risksLoading={risksLoading} />
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
            onGoToDiff={onGoToDiff}
            changedFiles={changedFiles}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        </>
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
