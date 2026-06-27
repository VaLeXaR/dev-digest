/* hooks/brief.ts — React Query hooks for PR Intent (the brief Intent slice).
   Intent is fetched once per PR and can be re-triggered via POST /generate. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type { PrIntentRecord, PrRisksRecord, SecretsStatus } from "@devdigest/shared";
import { FEATURE_MODELS, PROVIDER_LABELS } from "../feature-models";

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
      qc.invalidateQueries({ queryKey: ["risks", prId] });
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
    mutationFn: async (prId: string) => {
      const status = qc.getQueryData<SecretsStatus>(["secrets-status"]);
      if (status) {
        const feature = FEATURE_MODELS.find((f) => f.id === "risk_brief");
        const provider = feature?.defaultProvider as keyof SecretsStatus | undefined;
        if (provider && !status[provider]) {
          const providerLabel = PROVIDER_LABELS[provider] ?? provider;
          notify.error(
            `${feature!.label} requires a ${providerLabel} API key — configure it in Settings → API Keys`,
          );
          throw new Error("config_blocked");
        }
      }
      return api.post<PrRisksRecord>(`/pulls/${prId}/risks/generate`);
    },
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["risks", prId] });
    },
    onError: (err) => {
      if ((err as Error).message !== "config_blocked") {
        notify.error("Failed to generate risks");
      }
    },
  });
}
