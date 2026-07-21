/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/FindingCard";
import { EvalCaseEditor } from "../../../../../../../components/eval/EvalCaseEditor/EvalCaseEditor";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { useEvalCaseSeed } from "../../../../../../../lib/hooks/eval";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  severityFilter,
  onGoToDiff,
  targetFindingId,
  targetFindingNonce,
  agentId,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  severityFilter?: string | null;
  onGoToDiff?: (file: string, line: number) => void;
  targetFindingId?: string | null;
  targetFindingNonce?: number;
  /** The finding's own review's reviewing agent id (`review.agent_id`, G6) —
   *  required to build the "Turn into eval case" request path. Null/undefined
   *  when the review has no agent (summary/legacy reviews); the button is then
   *  disabled rather than hidden. */
  agentId?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // The finding whose "Turn into eval case" modal (screen 2) is open. Its seed
  // (owner + pre-filled fixture + any existing case) is fetched on demand; the
  // modal opens once the seed resolves. Only one is ever open at a time.
  const [evalFindingId, setEvalFindingId] = React.useState<string | null>(null);
  const seedQuery = useEvalCaseSeed(evalFindingId);

  // Never leave the button stuck in its loading state if the seed fetch fails.
  React.useEffect(() => {
    if (seedQuery.isError) setEvalFindingId(null);
  }, [seedQuery.isError]);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severityFilter ?? null),
    [findings, hideLow, severityFilter],
  );

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              onGoToDiff={onGoToDiff}
              targetId={targetFindingId}
              targetNonce={targetFindingNonce}
              onTurnIntoEvalCase={() => setEvalFindingId(f.id)}
              evalCaseDisabled={!agentId}
              evalCaseDisabledReason={t("finding.noAgentForEvalCase")}
              evalCasePending={seedQuery.isLoading && evalFindingId === f.id}
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
