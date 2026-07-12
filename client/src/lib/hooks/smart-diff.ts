/* hooks/smart-diff.ts — React Query hook for the Smart Diff slice.
   Fetches grouped file classification (core / wiring / boilerplate) for a PR. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type { SmartDiff, LineContextResponse } from "@devdigest/shared";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId ?? ""],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId!}/smart-diff`),
    enabled: !!prId,
  });
}

/**
 * Generates (one LLM call) and persists a one-line pseudocode summary for a
 * single changed file — triggered by that file's own "summary" button.
 * Invalidates the smart-diff query on success so the new
 * `pseudocode_summary` shows up without a manual refetch.
 */
export function useGenerateFileSummary(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: string) =>
      api.post<{ file: string; summary: string }>(`/pulls/${prId!}/smart-diff/file-summary`, { file }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-diff", prId ?? ""] });
    },
    onError: () => notify.error("Failed to generate the file summary"),
  });
}

/**
 * A window of raw file lines around `line`, read at the PR's head commit —
 * fallback for a click-to-line navigation target that isn't part of any
 * rendered diff hunk. `enabled` is controlled by the caller: only fetch once
 * SmartDiffViewer's scroll effect has confirmed the line isn't in the DOM.
 */
export function useLineContext(
  prId: string | null | undefined,
  file: string | null | undefined,
  line: number | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["line-context", prId ?? "", file ?? "", line ?? 0],
    queryFn: () =>
      api.get<LineContextResponse>(
        `/pulls/${prId!}/line-context?file=${encodeURIComponent(file!)}&line=${line}`,
      ),
    enabled: enabled && !!prId && !!file && line != null,
    // A 404 here (file/line genuinely unavailable at head) is an expected
    // outcome, not a transient failure — don't hammer the endpoint.
    retry: false,
  });
}
