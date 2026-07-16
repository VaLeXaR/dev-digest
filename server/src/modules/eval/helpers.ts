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
