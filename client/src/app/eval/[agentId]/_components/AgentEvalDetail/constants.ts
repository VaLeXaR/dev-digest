/** Constants + formatters for the per-agent eval detail page (T-13, design/06). */

export type DateRangeValue = "7" | "30" | "90" | "all";

export const DATE_RANGE_OPTIONS: { value: DateRangeValue; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

/**
 * Client-side date-range filter (G9 — no backend date query param in v1).
 * Filters an already-fetched list by `ran_at` against `now - N days`.
 */
export function filterByDateRange<T extends { ran_at: string }>(
  items: T[],
  range: DateRangeValue,
): T[] {
  if (range === "all") return items;
  const days = Number(range);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => new Date(item.ran_at).getTime() >= cutoff);
}

/**
 * Metric delta as signed integer percentage-points with a ▲/▼ arrow (C3 —
 * "▲ 4pt" / "▼ 2pt"). `null` (AC-25 n/a) renders "—", never "0pt"/"NaN".
 * A true zero delta renders "0pt" with a neutral color (no direction to
 * signal), matching the codebase's existing flat-state convention.
 */
export function formatDeltaPt(value: number | null): { text: string; color: string } {
  if (value == null || Number.isNaN(value)) return { text: "—", color: "var(--text-muted)" };
  const pts = Math.round(value * 100);
  if (pts === 0) return { text: "0pt", color: "var(--text-muted)" };
  const sign = pts > 0 ? "▲" : "▼";
  return { text: `${sign} ${Math.abs(pts)}pt`, color: pts > 0 ? "var(--ok)" : "var(--crit)" };
}

/** Signed dollar delta (C3 — "▲ $0.02"). Cost has no inherent "good" direction,
 *  so it always renders in the neutral/amber tone (matches design/02). */
export function formatCostDelta(
  oldValue: number | null,
  newValue: number | null,
): { text: string; color: string } {
  if (oldValue == null || newValue == null) return { text: "—", color: "var(--text-muted)" };
  const delta = Math.round((newValue - oldValue) * 100) / 100;
  if (delta === 0) return { text: "$0.00", color: "var(--text-muted)" };
  const sign = delta > 0 ? "▲" : "▼";
  return { text: `${sign} $${Math.abs(delta).toFixed(2)}`, color: "var(--warn)" };
}

/** Absolute cost value — `null` renders "—", never "$0.00" (unknown != free). */
export function formatCost(value: number | null | undefined): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

/**
 * Splits a dashboard `alert` string into a bold lead-in + the rest, on the
 * first " — " separator (matches design/06's "**Precision dipped 2pts on
 * v7** — a new false positive slipped in." bold/regular split). Falls back
 * to rendering the whole string un-bolded when no separator is present —
 * `alert` is server-authored freeform text, so this must degrade safely.
 */
export function splitAlert(alert: string | null): { bold: string | null; rest: string } {
  if (!alert) return { bold: null, rest: "" };
  const idx = alert.indexOf(" — ");
  if (idx === -1) return { bold: null, rest: alert };
  return { bold: alert.slice(0, idx), rest: alert.slice(idx) };
}
