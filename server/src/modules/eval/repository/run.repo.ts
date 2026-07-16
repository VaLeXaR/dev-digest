import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalOwnerKind, EvalRunRecord } from '@devdigest/shared';

/**
 * A5 — per-case eval-run data access (`eval_runs` table only). `batchId`
 * NULL means a scratch/single-case run (G7) — never part of a set-run
 * history/dashboard.
 */

export type EvalRunRow = typeof t.evalRuns.$inferSelect;

function toEvalRunRecord(row: EvalRunRow, caseName?: string | null): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName ?? null,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

export interface InsertEvalRunInput {
  caseId: string;
  /** NULL for single-case/scratch runs (G7) — no `eval_run_batches` row exists. */
  batchId: string | null;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  actualOutput: unknown;
  durationMs: number | null;
  costUsd: number | null;
}

export async function insertEvalRun(db: Db, values: InsertEvalRunInput): Promise<EvalRunRecord> {
  const [row] = await db
    .insert(t.evalRuns)
    .values({
      caseId: values.caseId,
      batchId: values.batchId,
      pass: values.pass,
      recall: values.recall,
      precision: values.precision,
      citationAccuracy: values.citationAccuracy,
      actualOutput: values.actualOutput,
      durationMs: values.durationMs,
      costUsd: values.costUsd,
    })
    .returning();
  return toEvalRunRecord(row!);
}

/** Latest run for a case by `ran_at`, batch or scratch (G7) — `undefined` means "never run". */
export async function lastRunForCase(db: Db, caseId: string): Promise<EvalRunRecord | undefined> {
  const [row] = await db
    .select({ run: t.evalRuns, caseName: t.evalCases.name })
    .from(t.evalRuns)
    .leftJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
    .where(eq(t.evalRuns.caseId, caseId))
    .orderBy(desc(t.evalRuns.ranAt))
    .limit(1);
  return row ? toEvalRunRecord(row.run, row.caseName) : undefined;
}

/**
 * Bulk "latest run per case" read (G7/R2 AC-4) — for every eval case owned by
 * the given owner (agent OR skill, T-04), the case's SINGLE latest
 * `eval_runs` row by `ran_at`, batch OR scratch (`batch_id IS NULL`). Powers
 * the Evals-tab per-case pass/fail/never-run state without being limited to
 * the latest BATCH only (unlike `batch.repo.ts:runsForBatch`) — a case run
 * via the single-case ▷ or the editor's "Run case"/"Run on save" (scratch,
 * `batch_id=NULL`) must still surface here. Workspace-scoped via
 * `eval_cases.workspace_id` directly — no join through `agents` needed
 * (unlike `eval_run_batches`, which has no `workspace_id` of its own, server
 * INSIGHTS 2026-07-15).
 */
export async function lastRunsForOwnerCases(
  db: Db,
  workspaceId: string,
  ownerKind: EvalOwnerKind,
  ownerId: string,
): Promise<EvalRunRecord[]> {
  const rows = await db
    .selectDistinctOn([t.evalRuns.caseId], { run: t.evalRuns, caseName: t.evalCases.name })
    .from(t.evalRuns)
    .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, ownerKind),
        eq(t.evalCases.ownerId, ownerId),
      ),
    )
    .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
  return rows.map((r) => toEvalRunRecord(r.run, r.caseName));
}

/** Agent-scoped convenience wrapper — keeps `EvalRepository.lastRunsForAgentCases`'s existing call signature (repository.ts is outside this task's owned paths). */
export async function lastRunsForAgentCases(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<EvalRunRecord[]> {
  return lastRunsForOwnerCases(db, workspaceId, 'agent', agentId);
}

export { toEvalRunRecord };
