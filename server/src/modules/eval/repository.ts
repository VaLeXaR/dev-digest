import type { Db } from '../../db/client.js';
import type { EvalCase, EvalCaseInput, EvalOwnerKind, EvalRunBatchRecord, EvalRunRecord } from '@devdigest/shared';

/**
 * A5 — eval data-access. The ONLY layer touching the DB for the eval domain
 * (onion Infrastructure — `modules/eval/service.ts` must never import
 * `db/schema`/`drizzle-orm` directly). Owns `eval_cases`, `eval_runs`,
 * `eval_run_batches`. Mirrors `reviews/repository.ts`: a thin class wrapper
 * composing function-level repos under `./repository/`. Method signatures
 * here do NOT auto-derive from the underlying functions — keep both in sync
 * (server INSIGHTS 2026-06-20).
 */

import * as caseRepo from './repository/case.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as batchRepo from './repository/batch.repo.js';
import type { EvalCaseUpdate } from './repository/case.repo.js';
import type { InsertEvalRunInput } from './repository/run.repo.js';
import type { InsertBatchInput } from './repository/batch.repo.js';

export type { EvalCaseUpdate, InsertEvalRunInput, InsertBatchInput };

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- eval-case CRUD ------------------------------------------------------

  listCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    return caseRepo.listCasesForAgent(this.db, workspaceId, agentId);
  }

  /** Owner-generic case list — 'agent' or 'skill' owner, scoped by workspace. */
  listCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCase[]> {
    return caseRepo.listCasesForOwner(this.db, workspaceId, ownerKind, ownerId);
  }

  getCase(workspaceId: string, caseId: string): Promise<EvalCase | undefined> {
    return caseRepo.getCase(this.db, workspaceId, caseId);
  }

  createCase(
    workspaceId: string,
    input: EvalCaseInput,
    sourceFindingId?: string | null,
  ): Promise<EvalCase> {
    return caseRepo.createCase(this.db, workspaceId, input, sourceFindingId);
  }

  updateCase(
    workspaceId: string,
    caseId: string,
    patch: EvalCaseUpdate,
  ): Promise<EvalCase | undefined> {
    return caseRepo.updateCase(this.db, workspaceId, caseId, patch);
  }

  deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return caseRepo.deleteCase(this.db, workspaceId, caseId);
  }

  /** AC-26 — finding ids that already back an eval case. */
  casesBackedByFindings(findingIds: string[]): Promise<Set<string>> {
    return caseRepo.casesBackedByFindings(this.db, findingIds);
  }

  // ---- per-case run persistence --------------------------------------------

  insertEvalRun(values: InsertEvalRunInput): Promise<EvalRunRecord> {
    return runRepo.insertEvalRun(this.db, values);
  }

  /** Latest run for a case (batch or scratch, G7) — `undefined` = "never run". */
  lastRunForCase(caseId: string): Promise<EvalRunRecord | undefined> {
    return runRepo.lastRunForCase(this.db, caseId);
  }

  /** Per-case latest run for every case owned by an agent (batch or scratch, G7/AC-4). */
  lastRunsForAgentCases(workspaceId: string, agentId: string): Promise<EvalRunRecord[]> {
    return runRepo.lastRunsForAgentCases(this.db, workspaceId, agentId);
  }

  // ---- batch persistence ----------------------------------------------------

  insertBatch(values: InsertBatchInput): Promise<EvalRunBatchRecord> {
    return batchRepo.insertBatch(this.db, values);
  }

  listBatchesForAgent(workspaceId: string, agentId: string): Promise<EvalRunBatchRecord[]> {
    return batchRepo.listBatchesForAgent(this.db, workspaceId, agentId);
  }

  getBatch(workspaceId: string, batchId: string): Promise<EvalRunBatchRecord | undefined> {
    return batchRepo.getBatch(this.db, workspaceId, batchId);
  }

  runsForBatch(workspaceId: string, batchId: string): Promise<EvalRunRecord[]> {
    return batchRepo.runsForBatch(this.db, workspaceId, batchId);
  }

  // ---- dashboard reads --------------------------------------------------------

  latestBatchPerAgent(workspaceId: string): Promise<Map<string, EvalRunBatchRecord>> {
    return batchRepo.latestBatchPerAgent(this.db, workspaceId);
  }

  batchTrendForAgent(workspaceId: string, agentId: string): Promise<EvalRunBatchRecord[]> {
    return batchRepo.batchTrendForAgent(this.db, workspaceId, agentId);
  }

  recentBatches(
    workspaceId: string,
    limit: number,
  ): Promise<(EvalRunBatchRecord & { agent_name: string })[]> {
    return batchRepo.recentBatches(this.db, workspaceId, limit);
  }
}
