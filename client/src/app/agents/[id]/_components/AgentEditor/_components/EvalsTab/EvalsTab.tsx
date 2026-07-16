"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, IconBtn, Badge, Icon } from "@devdigest/ui";
import type { Agent, EvalCase, EvalRunRecord } from "@devdigest/shared";
import {
  useEvalCases,
  useEvalCaseLastRuns,
  useEvalBatches,
  useRunEvalSet,
  useRunEvalCase,
  useDeleteEvalCase,
} from "../../../../../../../lib/hooks/eval";
import { EvalCaseEditor } from "../EvalCaseEditor/EvalCaseEditor";
import { formatDeltaPts, formatPct, latestTwoBatches, type CaseStatus } from "./constants";
import { s } from "./styles";

type EditorState = { mode: "new" } | { mode: "edit"; evalCase: EvalCase };

function MetricTile({
  label,
  value,
  delta,
  color,
}: {
  label: string;
  value: string;
  delta: { text: string; color: string } | null;
  color: string;
}) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileValueRow}>
        <span style={s.tileValue(color)}>{value}</span>
        {delta && <span style={s.tileDelta(delta.color)}>{delta.text}</span>}
      </div>
    </div>
  );
}

function caseStatus(run: EvalRunRecord | undefined): CaseStatus {
  if (!run) return "never-run";
  return run.pass ? "pass" : "fail";
}

/** First expected-output entry's severity/category, or "empty []" for a pure-precision case (R10). */
function caseBadgeText(c: EvalCase): string {
  const first = c.expected_output[0];
  if (!first) return "empty []";
  if (first.severity && first.category) return `${first.severity} · ${first.category}`;
  if (first.severity) return first.severity;
  if (first.category) return first.category;
  return "empty []";
}

function CaseRow({
  evalCase,
  run,
  onRun,
  onEdit,
  onDelete,
  running,
  t,
}: {
  evalCase: EvalCase;
  run: EvalRunRecord | undefined;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  running: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const status = caseStatus(run);
  const expectedCount = evalCase.expected_output.filter((e) => e.type === "must_find").length;
  const gotCount = Array.isArray(run?.actual_output) ? run.actual_output.length : 0;

  return (
    <div style={s.caseRow}>
      <div style={s.statusIconWrap}>
        {status === "pass" && <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} />}
        {status === "fail" && <Icon.XCircle size={16} style={{ color: "var(--crit)" }} />}
        {status === "never-run" && <span style={s.neverRunDot} />}
      </div>
      <div style={s.caseInfo}>
        <span className="mono" style={s.caseName}>
          {evalCase.name}
        </span>
        <span style={s.caseSubtitle}>
          {status === "never-run"
            ? t("evalsTab.neverRun")
            : `expected ${expectedCount} finding${expectedCount === 1 ? "" : "s"}, got ${gotCount}`}
        </span>
      </div>
      <span style={s.caseBadge}>{caseBadgeText(evalCase)}</span>
      <div style={s.caseActions}>
        <IconBtn icon="Play" label={running ? t("evalsTab.running") : t("evalsTab.run")} onClick={onRun} />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} onClick={onDelete} danger />
      </div>
    </div>
  );
}

/**
 * Evals tab (design/03) — EVAL METRICS row sourced from the agent's latest
 * batch (G7), "View full dashboard →" (R20/AC-28, no fetch), and the eval
 * cases list with pass / fail / never-run states (R2/R10).
 */
export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");

  const { data: cases, isLoading: casesLoading } = useEvalCases(agent.id);
  // Per-case status source of truth (R2/AC-4/G7) — the case's own latest run,
  // batch OR scratch, NOT `useAgentEvalDashboard(...).recent_runs` (scoped to
  // the latest BATCH only, which would miss a case run only via this tab's own
  // ▷ or the editor's "Run case"/"Run on save").
  const { data: lastRuns } = useEvalCaseLastRuns(agent.id);
  const { data: batches } = useEvalBatches(agent.id);
  const runSet = useRunEvalSet(agent.id);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();

  const [editorState, setEditorState] = React.useState<EditorState | null>(null);

  const runByCase = React.useMemo(() => {
    const map = new Map<string, EvalRunRecord>();
    for (const r of lastRuns ?? []) map.set(r.case_id, r);
    return map;
  }, [lastRuns]);

  const [latestBatch, previousBatch] = latestTwoBatches(batches);

  const casesList = cases ?? [];
  const passingCount = casesList.filter((c) => runByCase.get(c.id)?.pass === true).length;

  async function handleRunCase(c: EvalCase) {
    await runCase.mutateAsync({ caseId: c.id, agentId: agent.id });
  }

  function handleDeleteCase(c: EvalCase) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    deleteCase.mutate({ id: c.id, agentId: agent.id });
  }

  return (
    <div style={s.wrap}>
      <div style={s.metricsHeaderRow}>
        <div style={s.metricsTitleGroup}>
          <Icon.Target size={13} />
          <span style={s.metricsTitle}>EVAL METRICS</span>
        </div>
        <Link href="/eval" style={s.dashboardLink}>
          View full dashboard →
        </Link>
      </div>

      <div style={s.tilesGrid}>
        <MetricTile
          label={t("dashboard.metrics.recall")}
          value={formatPct(latestBatch?.recall)}
          delta={formatDeltaPts(latestBatch?.recall, previousBatch?.recall)}
          color="var(--accent-text)"
        />
        <MetricTile
          label={t("dashboard.metrics.precision")}
          value={formatPct(latestBatch?.precision)}
          delta={formatDeltaPts(latestBatch?.precision, previousBatch?.precision)}
          color="var(--ok)"
        />
        <MetricTile
          label={t("dashboard.metrics.citationAccuracy")}
          value={formatPct(latestBatch?.citation_accuracy)}
          delta={formatDeltaPts(latestBatch?.citation_accuracy, previousBatch?.citation_accuracy)}
          color="var(--warn)"
        />
        <MetricTile
          label="TRACES PASSED"
          value={latestBatch ? `${latestBatch.pass_count}/${latestBatch.total_count}` : "—"}
          delta={null}
          color="var(--text-primary)"
        />
      </div>

      <div style={s.casesHeaderRow}>
        <span style={s.casesTitle}>{t("evalsTab.casesHeading")}</span>
        <Badge color="var(--ok)" bg="var(--ok-bg)">
          {`${passingCount} / ${casesList.length} passing`}
        </Badge>
        <div style={s.casesHeaderRight}>
          <Button kind="ghost" icon="Play" loading={runSet.isPending} onClick={() => runSet.mutate()}>
            {runSet.isPending ? t("evalsTab.running") : "Run all evals"}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => setEditorState({ mode: "new" })}>
            New eval case
          </Button>
        </div>
      </div>

      <div style={s.casesList}>
        {casesLoading && <div style={s.loading}>{t("evalsTab.loadingCases")}</div>}
        {!casesLoading && casesList.length === 0 && <div style={s.empty}>{t("evalsTab.emptyCases")}</div>}
        {casesList.map((c) => (
          <CaseRow
            key={c.id}
            evalCase={c}
            run={runByCase.get(c.id)}
            onRun={() => handleRunCase(c)}
            onEdit={() => setEditorState({ mode: "edit", evalCase: c })}
            onDelete={() => handleDeleteCase(c)}
            running={runCase.isPending && runCase.variables?.caseId === c.id}
            t={t}
          />
        ))}
      </div>

      {editorState && (
        <EvalCaseEditor
          agent={agent}
          existingCase={editorState.mode === "edit" ? editorState.evalCase : undefined}
          onClose={() => setEditorState(null)}
        />
      )}
    </div>
  );
}
