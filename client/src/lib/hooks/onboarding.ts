/* hooks/onboarding.ts — React Query hooks for the repo-scoped Onboarding Tour.
     GET  /repos/:id/onboarding          → cached tour (or not_generated/index_required)
     POST /repos/:id/onboarding/generate → single-LLM-call (re)generation */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type {
  OnboardingGenerateResponse,
  OnboardingGetResponse,
} from "@devdigest/shared";

/** GET /repos/:id/onboarding → cached tour state (ready | not_generated | index_required).
    No LLM call — read-only (R10/AC-12). */
export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingGetResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    retry: false,
  });
}

/** POST /repos/:id/onboarding/generate → single-LLM-call (re)generation.
    Body-less POST — api.post omits content-type when no body is passed. */
export function useRegenerateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<OnboardingGenerateResponse>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (_data, repoId) => {
      qc.invalidateQueries({ queryKey: ["onboarding", repoId] });
    },
    onError: () => notify.error("Failed to generate onboarding tour"),
  });
}
