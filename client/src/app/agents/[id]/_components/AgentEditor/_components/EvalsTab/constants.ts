import type { EvalRunBatchRecord } from "@devdigest/shared";

/** Derived per-case status (design/03's three distinct states — "never run" is NOT a fail). */
export type CaseStatus = "pass" | "fail" | "never-run";

/**
 * C3 metric-delta format: signed integer percentage-points with a ▲/▼ arrow,
 * always arrow + sign + color together — never color alone (a11y). Returns
 * `null` when either side is unavailable, so the caller renders nothing.
 */
export function formatDeltaPts(
  current: number | null | undefined,
  previous: number | null | undefined,
): { text: string; color: string } | null {
  if (current == null || previous == null) return null;
  const pts = Math.round((current - previous) * 100);
  if (pts > 0) return { text: `▲ ${pts}pt`, color: "var(--ok)" };
  if (pts < 0) return { text: `▼ ${Math.abs(pts)}pt`, color: "var(--crit)" };
  return { text: "– 0pt", color: "var(--text-muted)" };
}

/** Render a nullable 0..1 fraction metric as a whole percentage, or "—" (never 0/NaN). */
export function formatPct(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * The two most recent batches, latest first — `useEvalBatches` already
 * orders by `ran_at DESC` server-side (see `batch.repo.ts:listBatchesForAgent`).
 * Used as the tile metrics' source instead of `EvalDashboard.current` because
 * `EvalRunBatchRecord.precision`/`citation_accuracy` are genuinely nullable
 * (G2/G3) while `EvalDashboard.current`'s same fields are NOT (a known
 * upstream contract limitation — a never-run agent can arrive as `0` there
 * instead of `null`).
 */
export function latestTwoBatches(
  batches: EvalRunBatchRecord[] | undefined,
): [EvalRunBatchRecord | null, EvalRunBatchRecord | null] {
  return [batches?.[0] ?? null, batches?.[1] ?? null];
}
