/* hooks/multi-agent.ts — React Query hooks for Multi-Agent Review runs.
   Estimate, launch, poll, and list multi-agent runs (N agents fanned out over
   one PR concurrently). Mirrors `lib/hooks/reviews.ts` conventions. For live
   per-run event streaming, reuse `useRunEvents` from `./reviews` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const POLL_INTERVAL_MS = 4000;
import { api } from "../api";
import type {
  MultiAgentEstimateRequest,
  MultiAgentEstimateResponse,
  MultiAgentRunCreateRequest,
  MultiAgentRunCreateResponse,
  MultiAgentRunDetail,
  MultiAgentRunListItem,
} from "@devdigest/shared";

// ---- Estimate cost/duration for a candidate agent set before launching ----
export interface MultiRunEstimateInput extends MultiAgentEstimateRequest {
  prId: string;
}

/** Estimate cost/duration for N agents against one PR. Cost/duration fields
   are nullable — an absolute cold start (no history to derive a token-rate
   from) returns null and the UI renders `—`, never a guessed number. */
export function useMultiRunEstimate() {
  return useMutation({
    mutationFn: ({ prId, agentIds }: MultiRunEstimateInput) =>
      api.post<MultiAgentEstimateResponse>(`/pulls/${prId}/multi-agent-runs/estimate`, {
        agentIds,
      } satisfies MultiAgentEstimateRequest),
  });
}

// ---- Launch a multi-agent run (fans out N agents concurrently) ----
export interface CreateMultiRunInput extends MultiAgentRunCreateRequest {
  prId: string;
}

export function useCreateMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: CreateMultiRunInput) =>
      api.post<MultiAgentRunCreateResponse>(`/pulls/${prId}/multi-agent-runs`, {
        agentIds,
      } satisfies MultiAgentRunCreateRequest),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent-run-history", prId] });
      // Repo-scoped landing list keys off repoId (not prId) — invalidate all so
      // the new run appears when the user next lands on /multi-agent-review.
      qc.invalidateQueries({ queryKey: ["multi-agent-run-history-repo"] });
    },
  });
}

// ---- Delete (unlink) a multi-agent run ----
/** Removes the run's comparison record; the linked agent_runs keep their
   history server-side (unlink semantics). Invalidates every history list so
   the deleted run drops out of both the per-PR and repo-landing dropdowns. */
export function useDeleteMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/multi-agent-runs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multi-agent-run-history"] });
      qc.invalidateQueries({ queryKey: ["multi-agent-run-history-repo"] });
    },
  });
}

// ---- One multi-agent run's detail (agents + cross-agent groups) ----
/** Polls while the run is still `running` so the results page self-updates;
   stops once the derived-on-read status settles to `complete`/`failed`. */
export function useMultiRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRunDetail>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? POLL_INTERVAL_MS : false,
  });
}

// ---- History list of multi-agent runs for a PR ----
export function useMultiRunHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run-history", prId],
    queryFn: () => api.get<MultiAgentRunListItem[]>(`/pulls/${prId}/multi-agent-runs`),
    enabled: !!prId,
  });
}

// ---- Recent multi-agent runs across a repo (the /multi-agent-review landing) ----
/** Newest first. Empty array = the repo has never had a multi-agent run (the
   only case the Configure/empty-state landing shows); otherwise the landing
   redirects to the latest run's results. */
export function useMultiRunHistoryForRepo(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run-history-repo", repoId],
    queryFn: () => api.get<MultiAgentRunListItem[]>(`/repos/${repoId}/multi-agent-runs`),
    enabled: !!repoId,
  });
}
