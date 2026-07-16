/**
 * A5 — pure helpers for eval run orchestration (no I/O). Kept separate from
 * `service.ts` so the aggregation math (G1-G3 uniform "0/0 -> null, excluded
 * from aggregate" policy) is independently testable without a DB/LLM.
 */

/** Per-case outcome of executing one eval case (scored or AC-18 failed). */
export interface CaseRunResult {
  caseId: string;
  pass: boolean;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  /** Raw findings array on success; `{ error: message }` on an AC-18 failure. */
  actualOutput: unknown;
  durationMs: number;
  costUsd: number | null;
}

export interface BatchAggregate {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  passCount: number;
  costUsd: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Aggregate a set-run's per-case results into the `eval_run_batches` row
 * shape. Every metric follows the same "0/0 -> null, excluded from the
 * aggregate" policy the per-case `scoreEvalCase` already applies (G1-G3) —
 * the mean is taken over only the cases that actually produced a value for
 * that metric. When zero cases produce a value the aggregate is `null`
 * ("n/a"), which is exactly R17's "zero must_find across the whole set ->
 * recall null" rule, since a case with zero must_find already scores
 * recall=null and is excluded here the same way.
 *
 * `costUsd` mirrors `reviewPullRequest`'s own fold precedent
 * (`reviewer-core/src/review/run.ts`): once any case's cost is unknown
 * (null), the whole total becomes null rather than silently under-counting.
 */
/**
 * Minimum precision drop (in whole percentage points, latest vs. previous
 * batch) that raises the dashboard regression banner. Matches design/06's
 * illustrated "Precision dipped 2pts on v7" example — a 2pt dip is alertable.
 */
export const PRECISION_DIP_ALERT_PTS = 2;

type MetricTrend = 'up' | 'down' | 'flat';

function trendOf(deltaPts: number): MetricTrend {
  if (deltaPts > 0) return 'up';
  if (deltaPts < 0) return 'down';
  return 'flat';
}

/**
 * Human sentence describing how recall and citation moved alongside a
 * precision dip (design/06: "Recall and citation both up."). Deltas are
 * fractions in [-1, 1]; rounded to whole points so sub-point noise reads as
 * "flat". Returns a leading-space-prefixed sentence, or "" when neither delta
 * is known (first batch has no previous to diff against).
 */
function describeCollateral(recallDelta: number | null, citationDelta: number | null): string {
  const r = recallDelta == null ? null : trendOf(Math.round(recallDelta * 100));
  const c = citationDelta == null ? null : trendOf(Math.round(citationDelta * 100));
  if (r == null && c == null) return '';
  if (r != null && c != null) {
    if (r === c) {
      return r === 'flat' ? ' Recall and citation flat.' : ` Recall and citation both ${r}.`;
    }
    return ` Recall ${r}, citation ${c}.`;
  }
  return r != null ? ` Recall ${r}.` : ` Citation ${c}.`;
}

/**
 * Regression banner text for an agent's eval dashboard (design/06). Fires only
 * when precision dropped by at least {@link PRECISION_DIP_ALERT_PTS} points
 * between the previous and latest batch; otherwise returns null (no banner).
 * The " — " separator is load-bearing: the client's `splitAlert` bolds the
 * lead-in ("Precision dipped Npts on vX") up to it and renders the rest plain.
 */
export function buildRegressionAlert(input: {
  latestPrecision: number | null | undefined;
  previousPrecision: number | null | undefined;
  latestVersion: number;
  recallDelta: number | null;
  citationDelta: number | null;
}): string | null {
  const { latestPrecision, previousPrecision, latestVersion, recallDelta, citationDelta } = input;
  if (latestPrecision == null || previousPrecision == null) return null;

  const dipPts = Math.round((previousPrecision - latestPrecision) * 100);
  if (dipPts < PRECISION_DIP_ALERT_PTS) return null;

  const collateral = describeCollateral(recallDelta, citationDelta);
  return `Precision dipped ${dipPts}pts on v${latestVersion} — more false positives slipped in.${collateral}`;
}

export function aggregateBatch(results: CaseRunResult[]): BatchAggregate {
  const recallValues = results
    .map((r) => r.recall)
    .filter((v): v is number => v !== null);
  const precisionValues = results
    .map((r) => r.precision)
    .filter((v): v is number => v !== null);
  const citationValues = results
    .map((r) => r.citation_accuracy)
    .filter((v): v is number => v !== null);

  let costUsd: number | null = 0;
  for (const r of results) {
    costUsd = costUsd === null || r.costUsd === null ? null : costUsd + r.costUsd;
  }

  return {
    recall: mean(recallValues),
    precision: mean(precisionValues),
    citation_accuracy: mean(citationValues),
    passCount: results.filter((r) => r.pass).length,
    costUsd,
  };
}
