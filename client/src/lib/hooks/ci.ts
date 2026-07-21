/* hooks/ci.ts — React Query hooks for Export-to-CI + the CI Runs dashboard.
     POST /agents/:id/export-ci        → generate CI files (+ optionally open a PR)
     GET  /ci-runs                     → ingested CI run rows (polls unconditionally every ~15s)
     POST /ci-runs/refresh             → manual re-ingest from GitHub Actions artifacts
     GET  /agents/:id/ci-installations → an agent's CI installations */
"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiRun,
} from "@devdigest/shared";

export const CI_RUNS_POLL_MS = 15_000;

/** POST /agents/:id/export-ci → generate the CI bundle (workflow + manifest + skills)
    and, per `action`, open a PR with the files. */
export function useExportCi(agentId: string | null | undefined) {
  return useMutation({
    mutationFn: (input: CiExportInputBody) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
  });
}

/** All ingested CI run rows across the workspace. Polls unconditionally every
    ~15s while the page is mounted (the ingest pipeline never persists a
    `running` `ci_runs` row — it only ever writes a terminal status — so a
    "poll only while running" guard would never fire; see client/INSIGHTS.md). */
export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRun[]>("/ci-runs"),
    refetchInterval: CI_RUNS_POLL_MS,
  });
}

/** POST /ci-runs/refresh → manually re-ingest CI run artifacts from GitHub Actions.
    Goes through `useMutation` so the global `MutationCache` (lib/providers.tsx)
    surfaces failures as a toast — this is the user-facing manual Refresh button. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/ci-runs/refresh"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci-runs"] }),
  });
}

/** Silent variant of the same POST /ci-runs/refresh ingest, for the ~15s
    auto-poll tick (AC-39). Deliberately bypasses `useMutation` — the global
    `MutationCache.onError` in `lib/providers.tsx` toasts on EVERY mutation
    failure regardless of any local `onError`, so an automatic tick that fails
    (e.g. `ConfigError` when `GITHUB_TOKEN` is unset) would otherwise spam an
    error toast every ~15s. Plain `api.post` + swallowed catch keeps failures
    silent while still invalidating the `ci-runs` query on success. */
export function useSilentRefreshCiRuns() {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    try {
      await api.post<{ ok: boolean }>("/ci-runs/refresh");
      await qc.invalidateQueries({ queryKey: ["ci-runs"] });
    } catch {
      // Automatic ingest tick failures must stay silent — see doc comment above.
    }
  }, [qc]);
}

/** GET /agents/:id/ci-installations → the target repos this agent is exported to. */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}
