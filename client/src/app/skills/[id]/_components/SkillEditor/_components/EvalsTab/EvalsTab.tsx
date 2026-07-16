"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, IconBtn, Badge, Icon } from "@devdigest/ui";
import type { Skill, EvalCase, EvalRunRecord } from "@devdigest/shared";
import {
  useSkillEvalCases,
  useSkillEvalCaseLastRuns,
  useRunSkillEvalSet,
  useRunEvalCase,
  useDeleteEvalCase,
} from "../../../../../../../lib/hooks/eval";
import { EvalCaseEditor } from "../../../../../../../components/eval/EvalCaseEditor/EvalCaseEditor";
import { s } from "./styles";

type EditorState = { mode: "new" } | { mode: "edit"; evalCase: EvalCase };
type CaseStatus = "pass" | "fail" | "never-run";

function caseStatus(run: EvalRunRecord | undefined): CaseStatus {
  if (!run) return "never-run";
  return run.pass ? "pass" : "fail";
}

/** First expected-output entry's severity/category, or "empty []" for a pure-precision case. */
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
        <div style={s.caseNameRow}>
          <span className="mono" style={s.caseName}>
            {evalCase.name}
          </span>
          <span style={s.typeLabel(expectedCount > 0)}>
            {expectedCount > 0 ? "must find" : "must not flag"}
          </span>
        </div>
        <span style={s.caseSubtitle}>
          {status === "never-run"
            ? t("evalsTab.neverRun")
            : `expected ${expectedCount} finding${expectedCount === 1 ? "" : "s"}, got ${gotCount}`}
        </span>
      </div>
      <span style={s.caseBadge}>{caseBadgeText(evalCase)}</span>
      <div style={s.caseActions}>
        <IconBtn icon="Play" label={running ? t("evalsTab.running") : t("evalsTab.run")} onClick={onRun} loading={running} />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} onClick={onDelete} danger />
      </div>
    </div>
  );
}

/**
 * Skill Evals tab (design/07) — a trimmed variant of the agent EvalsTab
 * (`AgentEditor/_components/EvalsTab/EvalsTab.tsx`): "Eval cases" heading +
 * `<passing>/<total> passing` badge, "Run all evals" + "+ New eval case", and
 * per-case rows with the same pass/fail/never-run + `empty []` rendering.
 * Deliberately OMITS the EVAL METRICS tile row and "View full dashboard →"
 * link — skills are not on the cross-agent Eval Dashboard (plan Design audit).
 */
export function EvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("eval");
  const qc = useQueryClient();

  const { data: cases, isLoading: casesLoading } = useSkillEvalCases(skill.id);
  // Per-case status source of truth (mirrors the agent tab's G7 decision) —
  // batch OR scratch run, from the skill-scoped last-runs read.
  const { data: lastRuns } = useSkillEvalCaseLastRuns(skill.id);
  const runSet = useRunSkillEvalSet(skill.id);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();

  const [editorState, setEditorState] = React.useState<EditorState | null>(null);

  const runByCase = React.useMemo(() => {
    const map = new Map<string, EvalRunRecord>();
    for (const r of lastRuns ?? []) map.set(r.case_id, r);
    return map;
  }, [lastRuns]);

  const casesList = cases ?? [];
  const passingCount = casesList.filter((c) => runByCase.get(c.id)?.pass === true).length;

  // `useRunEvalCase`/`useDeleteEvalCase` are owner-agnostic and only scope
  // their own cache invalidation via an optional `agentId` (T-06/T-07 known
  // limitation) — invalidate the skill-scoped last-runs/cases queries here so
  // a per-case run/delete from this tab still refreshes the passing count.
  async function handleRunCase(c: EvalCase) {
    await runCase.mutateAsync({ caseId: c.id, caseName: c.name });
    qc.invalidateQueries({ queryKey: ["skill-eval-case-last-runs", skill.id] });
  }

  function handleDeleteCase(c: EvalCase) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    deleteCase.mutate(
      { id: c.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["skill-eval-cases", skill.id] });
          qc.invalidateQueries({ queryKey: ["skill-eval-case-last-runs", skill.id] });
        },
      },
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.casesHeaderRow}>
        <span style={s.casesTitle}>{t("evalsTab.casesHeading")}</span>
        <Badge color="var(--warn)" bg="var(--warn-bg)">
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
            running={runSet.isPending || (runCase.isPending && runCase.variables?.caseId === c.id)}
            t={t}
          />
        ))}
      </div>

      {editorState && (
        <EvalCaseEditor
          owner={{ kind: "skill", id: skill.id, name: skill.name }}
          existingCase={editorState.mode === "edit" ? editorState.evalCase : undefined}
          initialLastRun={editorState.mode === "edit" ? runByCase.get(editorState.evalCase.id) : undefined}
          onClose={() => setEditorState(null)}
        />
      )}
    </div>
  );
}
