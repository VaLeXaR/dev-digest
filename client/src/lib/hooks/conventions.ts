"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate } from "@devdigest/shared";

export function useConventions(repoId: string) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (_data, repoId) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export interface PatchConventionInput {
  id: string;
  patch: {
    rule?: string;
    accepted?: boolean | null;
  };
}

export function useDeleteResolvedConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del(`/repos/${repoId}/conventions/resolved`),
    onSuccess: (_data, repoId) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export function useDeleteConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/conventions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conventions"] });
    },
  });
}

export function usePatchConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conventions"] });
    },
  });
}
