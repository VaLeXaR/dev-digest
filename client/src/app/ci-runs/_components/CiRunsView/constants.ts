/** Constants + tiny formatters for the global CI Runs page (T-04, design/06-ci-runs-page.png). */

/** Grid template for both the header row and run rows — 9 columns. */
export const GRID = "130px 1fr 170px 150px 60px 110px 70px 130px 60px";

/**
 * Column definitions in display order. Most reuse `ci.json`'s `runs.table.*`
 * keys (via `labelKey`); "agent" and "duration" have NO backing i18n key
 * (`ci.json`'s `table` object only has timestamp/pullRequest/source/findings/
 * cost/status — a pre-existing gap, see client/INSIGHTS.md 2026-07-19 entry
 * for the analogous `eval.json` case) so they fall back to a literal `label`.
 * "trace" has no header text in the design at all.
 */
export const COLUMNS: { key: string; labelKey?: string; label?: string }[] = [
  { key: "timestamp", labelKey: "timestamp" },
  { key: "pullRequest", labelKey: "pullRequest" },
  { key: "agent", label: "Agent" },
  { key: "source", labelKey: "source" },
  { key: "duration", label: "Dur." },
  { key: "findings", labelKey: "findings" },
  { key: "cost", labelKey: "cost" },
  { key: "status", labelKey: "status" },
  { key: "trace", label: "" },
];

/** CI run status → colour token + `runs.status.*` i18n key suffix. */
export const CI_STATUS_META: Record<string, { c: string; bg: string; labelKey: string }> = {
  succeeded: { c: "var(--ok)", bg: "var(--ok-bg)", labelKey: "succeeded" },
  no_findings: { c: "var(--text-muted)", bg: "var(--bg-hover)", labelKey: "noFindings" },
  failed: { c: "var(--crit)", bg: "var(--crit-bg)", labelKey: "failed" },
  running: { c: "var(--accent)", bg: "var(--accent-bg)", labelKey: "running" },
};

/** CI target values that have a ready-made label in `exportWizard.targets.*`. */
export const SOURCE_TARGET_KEYS = ["gha", "circle", "jenkins", "cli"];

/** Number of skeleton rows shown while loading. */
export const SKELETON_ROWS = 5;

/**
 * "2026-06-01 08:42" from an ISO timestamp — plain string slicing (same
 * approach as `eval`'s `formatRunTimestamp`, no `Date#toLocaleString` which is
 * locale/timezone-dependent). `null` (not yet ingested) renders "—".
 */
export function formatRunTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

/** `$0.07` from a nullable cost; `null`/`undefined` render "—", never `$0.00`. */
export function formatCost(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `$${v.toFixed(2)}`;
}

/** `7.4s` from a nullable duration; `null`/`undefined` render "—" (AC: ci_runs has no `duration` column yet). */
export function formatDuration(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v}s`;
}

/** True when `iso` falls within the last `days` days of now. Unparseable/null → false (excluded). */
export function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}
