import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalRunBatchRecord, EvalRunRecord } from '@devdigest/shared';
import { toEvalRunRecord } from './run.repo.js';

/**
 * A5 — set-run batch data access (`eval_run_batches` table + its
 * `eval_runs` drill-down). `eval_run_batches` has no `workspace_id` of its
 * own — every workspace-scoped read here joins through `agents.workspace_id`
 * (same IDOR-avoidance pattern as `onboarding/service.ts:resolveRepo`, server
 * INSIGHTS 2026-07-10 — never trust an id-only lookup across a tenancy
 * boundary when a join can enforce it in the query itself).
 */

export type EvalRunBatchRow = typeof t.evalRunBatches.$inferSelect;

function toBatchRecord(row: EvalRunBatchRow): EvalRunBatchRecord {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    ran_at: row.ranAt.toISOString(),
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    pass_count: row.passCount ?? 0,
    total_count: row.totalCount ?? 0,
    cost_usd: row.costUsd,
  };
}

export interface InsertBatchInput {
  agentId: string;
  agentVersion: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  passCount: number;
  totalCount: number;
  costUsd: number | null;
}

export async function insertBatch(db: Db, values: InsertBatchInput): Promise<EvalRunBatchRecord> {
  const [row] = await db
    .insert(t.evalRunBatches)
    .values({
      agentId: values.agentId,
      agentVersion: values.agentVersion,
      recall: values.recall,
      precision: values.precision,
      citationAccuracy: values.citationAccuracy,
      passCount: values.passCount,
      totalCount: values.totalCount,
      costUsd: values.costUsd,
    })
    .returning();
  return toBatchRecord(row!);
}

export async function listBatchesForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<EvalRunBatchRecord[]> {
  const rows = await db
    .select({ batch: t.evalRunBatches })
    .from(t.evalRunBatches)
    .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId))
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.evalRunBatches.agentId, agentId)))
    .orderBy(desc(t.evalRunBatches.ranAt));
  return rows.map((r) => toBatchRecord(r.batch));
}

export async function getBatch(
  db: Db,
  workspaceId: string,
  batchId: string,
): Promise<EvalRunBatchRecord | undefined> {
  const [row] = await db
    .select({ batch: t.evalRunBatches })
    .from(t.evalRunBatches)
    .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId))
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.evalRunBatches.id, batchId)));
  return row ? toBatchRecord(row.batch) : undefined;
}

/** Per-case drill-down for a set-run batch, newest first. */
export async function runsForBatch(
  db: Db,
  workspaceId: string,
  batchId: string,
): Promise<EvalRunRecord[]> {
  const rows = await db
    .select({ run: t.evalRuns, caseName: t.evalCases.name })
    .from(t.evalRuns)
    .innerJoin(t.evalRunBatches, eq(t.evalRunBatches.id, t.evalRuns.batchId))
    .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId))
    .leftJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.evalRunBatches.id, batchId)))
    .orderBy(desc(t.evalRuns.ranAt));
  return rows.map((r) => toEvalRunRecord(r.run, r.caseName));
}

/** Latest batch per agent in the workspace, keyed by `agent_id` — for the dashboard overview (G8). */
export async function latestBatchPerAgent(
  db: Db,
  workspaceId: string,
): Promise<Map<string, EvalRunBatchRecord>> {
  const rows = await db
    .select({ batch: t.evalRunBatches })
    .from(t.evalRunBatches)
    .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId))
    .where(eq(t.agents.workspaceId, workspaceId))
    .orderBy(desc(t.evalRunBatches.ranAt));

  const byAgent = new Map<string, EvalRunBatchRecord>();
  for (const r of rows) {
    if (!byAgent.has(r.batch.agentId)) byAgent.set(r.batch.agentId, toBatchRecord(r.batch));
  }
  return byAgent;
}

/** Full batch history for one agent, chronological (oldest -> newest) — trend/sparkline source. */
export async function batchTrendForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<EvalRunBatchRecord[]> {
  const rows = await db
    .select({ batch: t.evalRunBatches })
    .from(t.evalRunBatches)
    .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId))
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.evalRunBatches.agentId, agentId)))
    .orderBy(t.evalRunBatches.ranAt);
  return rows.map((r) => toBatchRecord(r.batch));
}

/** Most recent set-run batches across every agent in the workspace, newest first. */
export async function recentBatches(
  db: Db,
  workspaceId: string,
  limit: number,
): Promise<(EvalRunBatchRecord & { agent_name: string })[]> {
  const rows = await db
    .select({ batch: t.evalRunBatches, agentName: t.agents.name })
    .from(t.evalRunBatches)
    .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId))
    .where(eq(t.agents.workspaceId, workspaceId))
    .orderBy(desc(t.evalRunBatches.ranAt))
    .limit(limit);
  return rows.map((r) => ({ ...toBatchRecord(r.batch), agent_name: r.agentName }));
}
