/* TabsView — Multi-Agent Review results, Tabs mode (T-13, design/05.png):
   per-agent tab row (category icon + name + score), the selected agent's
   summary card (score ring + verdict text + "View trace" + cost), and its
   findings rendered via the shared `FindingCard` (Accept/Dismiss/Turn-into-
   eval-case functional, Learn/Reply-to-author visible-but-disabled stubs).

   `MultiAgentRunDetail` carries no raw per-agent findings array — only the
   compact cross-agent `groups`. Full finding data (rationale, suggestion,
   confidence, accepted_at/dismissed_at) is reached the SAME way the existing
   PR findings page reaches it: `usePrReviews(prId)` returns every persisted
   `ReviewRecord` for the PR (the multi-agent executor reuses the same
   `ReviewService.runReview` path, so each agent's run persists a `ReviewRecord`
   exactly like a single-agent review does) — matched here by `review.run_id
   === selectedAgent.runId`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon } from "@devdigest/ui";
import type { MultiAgentRunAgent } from "@devdigest/shared";
import { FindingCard } from "@/components/FindingCard";
import { EvalCaseEditor } from "@/components/eval/EvalCaseEditor/EvalCaseEditor";
import { usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useEvalCaseSeed } from "@/lib/hooks/eval";
import { columnStyleFor } from "../../constants";
import { formatCost, formatDuration } from "../../helpers";
import { scoreColor } from "./helpers";
import { s } from "./styles";

export function TabsView({
  agents,
  prId,
  repoFullName,
  headSha,
  onViewTrace,
}: {
  agents: MultiAgentRunAgent[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const tFinding = useTranslations("prReview");

  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(
    agents[0]?.agentId ?? null,
  );
  const selectedAgent = agents.find((a) => a.agentId === selectedAgentId) ?? agents[0] ?? null;
  const selectedIndex = selectedAgent ? agents.indexOf(selectedAgent) : 0;
  const palette = columnStyleFor(selectedIndex);

  const { data: reviews, isLoading: reviewsLoading } = usePrReviews(prId);
  const review = reviews?.find((r) => r.run_id === selectedAgent?.runId) ?? null;
  const findings = review?.findings ?? [];

  const action = useFindingAction();
  const [evalFindingId, setEvalFindingId] = React.useState<string | null>(null);
  const seedQuery = useEvalCaseSeed(evalFindingId);
  React.useEffect(() => {
    if (seedQuery.isError) setEvalFindingId(null);
  }, [seedQuery.isError]);

  return (
    <div style={s.wrap} data-testid="tabs-view">
      <div style={s.tabRow} role="tablist">
        {agents.map((agent, i) => {
          const tabPalette = columnStyleFor(i);
          const TabIcon = Icon[tabPalette.icon];
          const active = agent.agentId === selectedAgent?.agentId;
          return (
            <button
              key={agent.agentId}
              type="button"
              role="tab"
              aria-selected={active}
              style={s.tab(active, tabPalette.color)}
              onClick={() => setSelectedAgentId(agent.agentId)}
            >
              <TabIcon size={14} style={{ color: active ? tabPalette.color : "var(--text-muted)" }} />
              <span style={s.tabLabel(active, tabPalette.color)}>{agent.name}</span>
              {agent.score != null && (
                <span className="tnum" style={s.tabScore(scoreColor(agent.score))}>
                  {agent.score}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedAgent && (
        <div style={s.summaryCard(palette.color)}>
          {selectedAgent.score != null ? (
            <CircularScore score={selectedAgent.score} size={48} stroke={4} />
          ) : (
            <div style={s.scorePlaceholder}>—</div>
          )}
          <div style={s.summaryBody}>
            <div style={s.summaryTitle(palette.color)}>{selectedAgent.name}</div>
            <div style={s.summaryText}>
              {reviewsLoading ? t("tab.loadingSummary") : (review?.summary ?? t("tab.noSummary"))}
            </div>
          </div>
          <div style={s.summaryRight}>
            <button
              type="button"
              style={s.viewTraceLink}
              onClick={() => onViewTrace(selectedAgent.runId)}
            >
              {t("column.viewTrace")}
            </button>
            <span style={s.summaryMeta}>
              {formatDuration(selectedAgent.durationMs)} · {formatCost(selectedAgent.costUsd)}
            </span>
          </div>
        </div>
      )}

      <div style={s.findingsList}>
        {findings.length === 0 ? (
          <div style={s.noFindings}>{t("column.noFindings")}</div>
        ) : (
          findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              onTurnIntoEvalCase={() => setEvalFindingId(f.id)}
              evalCaseDisabled={!selectedAgent?.agentId}
              evalCaseDisabledReason={tFinding("finding.noAgentForEvalCase")}
              evalCasePending={seedQuery.isLoading && evalFindingId === f.id}
              showStubActions
            />
          ))
        )}
      </div>

      {evalFindingId && seedQuery.data && (
        <EvalCaseEditor
          owner={seedQuery.data.owner}
          existingCase={seedQuery.data.existing_case ?? undefined}
          seed={seedQuery.data.existing_case ? undefined : seedQuery.data.seed}
          fromFinding={seedQuery.data.existing_case ? undefined : { findingId: evalFindingId }}
          onClose={() => setEvalFindingId(null)}
        />
      )}
    </div>
  );
}
