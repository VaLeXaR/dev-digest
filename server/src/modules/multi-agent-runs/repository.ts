import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentHistorySample, DiffSizeRate } from './estimate.js';
import type { CrossAgentFindingInput } from './grouping.js';

/**
 * multi-agent-runs data access (Infrastructure — the ONLY file in this module
 * allowed to import `db/schema` + drizzle, per the plan's onion note). Every
 * read is workspace-scoped where the caller can leak across tenants (R4/
 * AC-7/AC-8) — `getMultiRun`/`listMultiRuns`. `linkedAgentRuns`/
 * `findingsForMultiRun` key off `multiAgentRunId` alone: callers reach them
 * only after `getMultiRun` has already proven workspace ownership of that id.
 */

// ---------------------------------------------------------------- create/read

export interface InsertMultiRunInput {
  workspaceId: string;
  prId: string;
  selectedAgentIds: string[];
  status: 'running';
  estimatedCostUsd: number | null;
  estimatedDurationMs: number | null;
}

export async function insertMultiRun(db: Db, values: InsertMultiRunInput): Promise<string> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({
      workspaceId: values.workspaceId,
      prId: values.prId,
      selectedAgentIds: values.selectedAgentIds,
      status: values.status,
      estimatedCostUsd: values.estimatedCostUsd,
      estimatedDurationMs: values.estimatedDurationMs,
    })
    .returning({ id: t.multiAgentRuns.id });
  return row!.id;
}

export interface MultiRunRow {
  id: string;
  workspaceId: string;
  prId: string;
  ranAt: string;
  selectedAgentIds: string[];
  /** Derived-on-write initial value only ('running') — callers must derive the effective status via `status.ts`. */
  status: string | null;
  estimatedCostUsd: number | null;
  estimatedDurationMs: number | null;
}

function toMultiRunRow(row: typeof t.multiAgentRuns.$inferSelect): MultiRunRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    prId: row.prId,
    ranAt: row.ranAt.toISOString(),
    selectedAgentIds: row.selectedAgentIds ?? [],
    status: row.status,
    estimatedCostUsd: row.estimatedCostUsd,
    estimatedDurationMs: row.estimatedDurationMs,
  };
}

/** Workspace-scoped lookup — returns undefined (not another workspace's row) on a cross-workspace id (AC-7/AC-8). */
export async function getMultiRun(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiRunRow | undefined> {
  const [row] = await db
    .select()
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
  return row ? toMultiRunRow(row) : undefined;
}

/** History list for a PR, newest first. Workspace-scoped. */
export async function listMultiRuns(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiRunRow[]> {
  const rows = await db
    .select()
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt));
  return rows.map(toMultiRunRow);
}

/**
 * Recent multi-agent runs across ALL PRs of one repo, newest first
 * (the `/multi-agent-review` landing source). Workspace-scoped; joins through
 * `pull_requests` to filter by repo.
 */
export async function listMultiRunsForRepo(
  db: Db,
  workspaceId: string,
  repoId: string,
  limit = 20,
): Promise<MultiRunRow[]> {
  const rows = await db
    .select({ mr: t.multiAgentRuns })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(limit);
  return rows.map((r) => toMultiRunRow(r.mr));
}

/**
 * Delete one multi-agent run (workspace-scoped). The linked `agent_runs` are
 * NOT removed — the FK `agent_runs.multi_agent_run_id` is `ON DELETE set null`
 * (schema/runs.ts:42-43), so each spawned run keeps its history and survives as
 * a standalone review on the PR; only the cross-agent comparison grouping is
 * dropped. Returns false when no such run existed in the workspace (→ 404).
 */
export async function deleteMultiRun(db: Db, workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)))
    .returning({ id: t.multiAgentRuns.id });
  return rows.length > 0;
}

// ------------------------------------------------------------- linked runs

export interface LinkedAgentRunRow {
  agentId: string | null;
  runId: string;
  name: string;
  status: string | null;
  costUsd: number | null;
  durationMs: number | null;
  score: number | null;
  findingsCount: number | null;
}

/** `agent_runs` spawned by one multi-agent run, each joined to its agent's name. */
export async function linkedAgentRuns(db: Db, multiRunId: string): Promise<LinkedAgentRunRow[]> {
  const rows = await db
    .select({
      agentId: t.agentRuns.agentId,
      runId: t.agentRuns.id,
      name: t.agents.name,
      status: t.agentRuns.status,
      costUsd: t.agentRuns.costUsd,
      durationMs: t.agentRuns.durationMs,
      score: t.agentRuns.score,
      findingsCount: t.agentRuns.findingsCount,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.agentRuns.multiAgentRunId, multiRunId));
  return rows.map((r) => ({ ...r, name: r.name ?? 'Unknown agent' }));
}

/** Findings from every agent_run linked to one multi-agent run — input to `grouping.groupCrossAgent`. */
export async function findingsForMultiRun(
  db: Db,
  multiRunId: string,
): Promise<CrossAgentFindingInput[]> {
  const rows = await db
    .select({
      agentId: t.agentRuns.agentId,
      findingId: t.findings.id,
      file: t.findings.file,
      startLine: t.findings.startLine,
      endLine: t.findings.endLine,
      severity: t.findings.severity,
      title: t.findings.title,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
    .where(eq(t.agentRuns.multiAgentRunId, multiRunId));
  return rows
    .filter((r): r is typeof r & { agentId: string } => r.agentId != null)
    .map((r) => ({
      agentId: r.agentId,
      findingId: r.findingId,
      file: r.file,
      startLine: r.startLine,
      endLine: r.endLine,
      severity: r.severity as CrossAgentFindingInput['severity'],
      title: r.title,
    }));
}

// ------------------------------------------------------------- estimate aggregates

/** Last `limit` completed (status='done') runs of one agent on PRs of one repo — the history basis for AC-11. */
export async function recentCompletedRunsForAgentOnRepo(
  db: Db,
  agentId: string,
  repoId: string,
  limit = 20,
): Promise<AgentHistorySample | undefined> {
  const rows = await db
    .select({ costUsd: t.agentRuns.costUsd, durationMs: t.agentRuns.durationMs })
    .from(t.agentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .where(
      and(
        eq(t.agentRuns.agentId, agentId),
        eq(t.agentRuns.status, 'done'),
        eq(t.pullRequests.repoId, repoId),
      ),
    )
    .orderBy(desc(t.agentRuns.ranAt))
    .limit(limit);

  if (rows.length === 0) return undefined;

  const costs = rows.map((r) => r.costUsd).filter((v): v is number => v != null);
  const durations = rows.map((r) => r.durationMs).filter((v): v is number => v != null);
  return {
    avgCostUsd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  };
}

type TokenRateRow = {
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  additions: number;
  deletions: number;
};

const tokenRateSelection = {
  tokensIn: t.agentRuns.tokensIn,
  tokensOut: t.agentRuns.tokensOut,
  durationMs: t.agentRuns.durationMs,
  additions: t.pullRequests.additions,
  deletions: t.pullRequests.deletions,
};

/** Averages the per-run (tokens/line, ms/line) ratio across rows with a usable diff size + full token/duration data. */
function computeTokenRate(rows: TokenRateRow[]): DiffSizeRate | null {
  const ratios: { tokensPerLine: number; msPerLine: number }[] = [];
  for (const r of rows) {
    const diffSize = r.additions + r.deletions;
    if (diffSize <= 0) continue;
    if (r.tokensIn == null || r.tokensOut == null || r.durationMs == null) continue;
    ratios.push({
      tokensPerLine: (r.tokensIn + r.tokensOut) / diffSize,
      msPerLine: r.durationMs / diffSize,
    });
  }
  if (ratios.length === 0) return null;
  return {
    tokensPerDiffLine: ratios.reduce((sum, r) => sum + r.tokensPerLine, 0) / ratios.length,
    msPerDiffLine: ratios.reduce((sum, r) => sum + r.msPerLine, 0) / ratios.length,
  };
}

/**
 * Repo-scoped (tokens_in+tokens_out)/diff-line AND duration_ms/diff-line
 * average over completed runs on this repo; falls back to a workspace-global
 * average over completed runs on ANY repo in the same workspace when the repo
 * itself has none; `null` when neither can be derived (absolute cold start —
 * no completed run anywhere in the workspace).
 */
export async function repoTokenRate(db: Db, repoId: string): Promise<DiffSizeRate | null> {
  const repoRows = await db
    .select(tokenRateSelection)
    .from(t.agentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.agentRuns.status, 'done')));

  const repoRate = computeTokenRate(repoRows);
  if (repoRate) return repoRate;

  const [repoRow] = await db
    .select({ workspaceId: t.repos.workspaceId })
    .from(t.repos)
    .where(eq(t.repos.id, repoId));
  if (!repoRow) return null;

  const workspaceRows = await db
    .select(tokenRateSelection)
    .from(t.agentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .where(and(eq(t.pullRequests.workspaceId, repoRow.workspaceId), eq(t.agentRuns.status, 'done')));

  return computeTokenRate(workspaceRows);
}

/** PR diff size (additions + deletions) from the already-persisted PR row. */
export async function pullDiffSize(db: Db, prId: string): Promise<number | null> {
  const [row] = await db
    .select({ additions: t.pullRequests.additions, deletions: t.pullRequests.deletions })
    .from(t.pullRequests)
    .where(eq(t.pullRequests.id, prId));
  if (!row) return null;
  return row.additions + row.deletions;
}
