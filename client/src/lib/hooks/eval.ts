/* hooks/eval.ts — React Query hooks for the A4 Eval Pipeline (cases, runs, dashboards). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type {
  Agent,
  EvalCase,
  EvalCaseFromFindingInput,
  EvalCaseInput,
  EvalDashboard,
  EvalDashboardOverview,
  EvalRunBatchRecord,
  EvalRunBatchResult,
  EvalRunRecord,
} from "@devdigest/shared";

// ===========================================================================
// Queries
// ===========================================================================

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** Cross-agent landing-page overview — `GET /eval/dashboard`. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard-overview"],
    queryFn: () => api.get<EvalDashboardOverview>("/eval/dashboard"),
  });
}

/** Single-agent detail dashboard — `GET /agents/:id/eval/dashboard`. */
export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval/dashboard`),
    enabled: !!agentId,
  });
}

/**
 * Per-case latest run (batch OR scratch, R2/AC-4/G7) — the Evals-tab status
 * source of truth. Unlike `useAgentEvalDashboard(...).recent_runs` (scoped to
 * the latest BATCH only), this surfaces a case run via the single-case ▷ or
 * the editor's "Run case"/"Run on save" (scratch, batch_id=NULL) too.
 */
export function useEvalCaseLastRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-last-runs", agentId],
    queryFn: () => api.get<EvalRunRecord[]>(`/agents/${agentId}/eval-cases/last-runs`),
    enabled: !!agentId,
  });
}

export function useEvalBatches(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batches", agentId],
    queryFn: () => api.get<EvalRunBatchRecord[]>(`/agents/${agentId}/eval-batches`),
    enabled: !!agentId,
  });
}

export function useEvalBatchRuns(batchId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batch-runs", batchId],
    queryFn: () => api.get<EvalRunRecord[]>(`/eval-batches/${batchId}/runs`),
    enabled: !!batchId,
  });
}

/**
 * Which of `findingIds` already back an eval case — `GET /findings/eval-cases?ids=a,b,c`.
 * Unwraps `{ finding_ids }` into a `Set<string>` so callers can do
 * `data?.has(findingId)` for an O(1) "does this finding already have a case?" check.
 * Disabled when `findingIds` is empty (no server round-trip for an empty list).
 */
export function useFindingsWithEvalCases(findingIds: string[]) {
  const idsParam = findingIds.join(",");
  return useQuery({
    queryKey: ["findings-eval-cases", idsParam],
    queryFn: async () => {
      const res = await api.get<{ finding_ids: string[] }>(
        `/findings/eval-cases?ids=${encodeURIComponent(idsParam)}`
      );
      return new Set(res.finding_ids);
    },
    enabled: findingIds.length > 0,
  });
}

// ===========================================================================
// Mutations
// ===========================================================================

/** Toast the aggregate result of a "Run all evals" batch (owner-agnostic). */
function notifyBatchResult(batch: EvalRunBatchResult): void {
  const msg = `Evals: ${batch.pass_count}/${batch.total_count} passed`;
  if (batch.pass_count === batch.total_count) notify.success(msg);
  else notify.error(msg);
}

/** `POST /agents/:id/eval-runs` (no body) — runs the whole eval set for the agent. */
export function useRunEvalSet(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunBatchResult>(`/agents/${agentId}/eval-runs`),
    onSuccess: (batch) => {
      notifyBatchResult(batch);
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard-overview"] });
      qc.invalidateQueries({ queryKey: ["eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-case-last-runs", agentId] });
    },
  });
}

export interface RunEvalCaseInput {
  caseId: string;
  /** Optional — when known, scopes invalidation to just that agent's cases. */
  agentId?: string;
  /** Optional — the case name, used for the result toast (the run record's
   * `case_name` is null for a single-case run, so callers pass it explicitly). */
  caseName?: string;
}

/** `POST /eval-cases/:id/run` — runs a single case; toasts the pass/fail result. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId }: RunEvalCaseInput) =>
      api.post<EvalRunRecord>(`/eval-cases/${caseId}/run`),
    onSuccess: (data, variables) => {
      const name = variables.caseName ?? data.case_name ?? "Eval case";
      if (data.pass === true) notify.success(`${name} — passed`);
      else if (data.pass === false) notify.error(`${name} — failed`);
      else notify.info(`${name} — completed`);
      qc.invalidateQueries({
        queryKey: variables.agentId ? ["eval-cases", variables.agentId] : ["eval-cases"],
      });
      if (variables.agentId) {
        qc.invalidateQueries({ queryKey: ["eval-case-last-runs", variables.agentId] });
      }
    },
  });
}

/** Caller-facing input for `useCreateEvalCase` — owner fields are filled in from `agentId`. */
export type CreateEvalCaseInput = Omit<EvalCaseInput, "owner_kind" | "owner_id">;

/** `POST /agents/:id/eval-cases` — route does not inject owner fields, so they're set here. */
export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEvalCaseInput) =>
      api.post<EvalCase>(`/agents/${agentId}/eval-cases`, {
        ...input,
        owner_kind: "agent",
        owner_id: agentId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: Partial<CreateEvalCaseInput>;
  /** Optional — when known, scopes invalidation to just that agent's cases. */
  agentId?: string;
}

/** `PATCH /eval-cases/:id`. */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) => api.patch<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: variables.agentId ? ["eval-cases", variables.agentId] : ["eval-cases"],
      });
    },
  });
}

export interface DeleteEvalCaseInput {
  id: string;
  /** Optional — when known, scopes invalidation to just that agent's cases. */
  agentId?: string;
}

/** `DELETE /eval-cases/:id`. */
export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteEvalCaseInput) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: variables.agentId ? ["eval-cases", variables.agentId] : ["eval-cases"],
      });
    },
  });
}

/** `POST /agents/:id/eval-cases/from-finding` — body `{ finding_id }`. */
export function useCreateEvalCaseFromFinding(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseFromFindingInput) =>
      api.post<EvalCase>(`/agents/${agentId}/eval-cases/from-finding`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["findings-eval-cases"] });
    },
  });
}

// ===========================================================================
// Skill-owner hooks (R2/R3/R4) — mirror the agent hooks above, distinct query
// keys ("skill-eval-cases"/"skill-eval-case-last-runs") so agent and skill
// caches never collide. Per-case run/edit/delete reuse the owner-agnostic
// `useRunEvalCase`/`useUpdateEvalCase`/`useDeleteEvalCase` above unchanged.
// ===========================================================================

/** `GET /skills/:id/eval-cases` (R2/AC-29). */
export function useSkillEvalCases(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-eval-cases", skillId],
    queryFn: () => api.get<EvalCase[]>(`/skills/${skillId}/eval-cases`),
    enabled: !!skillId,
  });
}

/** Per-case latest run (batch OR scratch) for a skill's Evals tab — `GET /skills/:id/eval-cases/last-runs` (R2/AC-29). */
export function useSkillEvalCaseLastRuns(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-eval-case-last-runs", skillId],
    queryFn: () => api.get<EvalRunRecord[]>(`/skills/${skillId}/eval-cases/last-runs`),
    enabled: !!skillId,
  });
}

/** `POST /skills/:id/eval-runs` (no body) — runs the whole eval set for the skill (R4/AC-33). */
export function useRunSkillEvalSet(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunBatchResult>(`/skills/${skillId}/eval-runs`),
    onSuccess: (batch) => {
      notifyBatchResult(batch);
      qc.invalidateQueries({ queryKey: ["skill-eval-cases", skillId] });
      qc.invalidateQueries({ queryKey: ["skill-eval-case-last-runs", skillId] });
    },
  });
}

/** `POST /skills/:id/eval-cases` — route does not inject owner fields, so they're set here (R3/AC-30). */
export function useCreateSkillEvalCase(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEvalCaseInput) =>
      api.post<EvalCase>(`/skills/${skillId}/eval-cases`, {
        ...input,
        owner_kind: "skill",
        owner_id: skillId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skill-eval-cases", skillId] }),
  });
}

/** `POST /agents/:id/versions/:version/promote` — promotes a snapshot to the active config. */
export function usePromoteAgentVersion(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.post<Agent>(`/agents/${agentId}/versions/${version}/promote`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", agentId], data);
    },
  });
}
