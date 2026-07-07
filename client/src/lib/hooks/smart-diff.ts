/* hooks/smart-diff.ts — React Query hook for the Smart Diff slice.
   Fetches grouped file classification (core / wiring / boilerplate) for a PR. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff, LineContextResponse } from "@devdigest/shared";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId ?? ""],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId!}/smart-diff`),
    enabled: !!prId,
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
