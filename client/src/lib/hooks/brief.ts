/* hooks/brief.ts — React Query hooks for PR Intent (the brief Intent slice).
   Intent is fetched once per PR and can be re-triggered via POST /generate. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type { PrIntentRecord, PrRisksRecord } from "@devdigest/shared";

export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId ?? ""],
    queryFn: () => api.get<PrIntentRecord>(`/pulls/${prId!}/intent`),
    enabled: !!prId,
    // 404 = no intent computed yet — show empty state immediately, no spin.
    retry: false,
  });
}

export function useRecalculateIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prId: string) =>
      api.post<PrIntentRecord>(`/pulls/${prId}/intent/generate`),
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["intent", prId] });
    },
    onError: () => notify.error("Failed to recalculate intent"),
  });
}

export function useRisks(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["risks", prId ?? ""],
    queryFn: () => api.get<PrRisksRecord>(`/pulls/${prId!}/risks`),
    enabled: !!prId,
    retry: false,
  });
}

export function useGenerateRisks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prId: string) =>
      api.post<PrRisksRecord>(`/pulls/${prId}/risks/generate`),
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["risks", prId] });
    },
    onError: () => notify.error("Failed to generate risks"),
  });
}
