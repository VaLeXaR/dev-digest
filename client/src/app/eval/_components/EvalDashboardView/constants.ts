/** Constants + tiny formatters for the Eval Dashboard (T-12). */

/** Recall/Precision/Citation column colors — match the design's blue/green/orange. */
export const METRIC_COLORS = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

/**
 * Format a 0–1 fraction metric as a whole-number percentage string.
 * `null`/`undefined`/`NaN` render as "—" — NEVER coerced to "0%" (a batch's
 * metric is null when its denominator is 0, which is "n/a", not zero).
 */
export function formatMetricPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Bar-fill width (0–100) for a 0–1 fraction metric; null/NaN → empty bar. */
export function metricBarWidth(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

/**
 * "2026-05-29 09:14" from an ISO timestamp — plain string slicing, no
 * `Date#toLocaleString` (locale/timezone-dependent, would make snapshot
 * assertions in tests flaky across CI machines).
 */
export function formatRunTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}
