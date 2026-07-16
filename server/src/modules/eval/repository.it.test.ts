import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type Db } from '../../db/client.js';
import { runMigrations } from '../../db/migrate.js';
import * as t from '../../db/schema.js';
import { EvalRepository } from './repository.js';
import type { EvalCaseInput } from '@devdigest/shared';

/**
 * DB-backed round-trip test for `EvalRepository` (T-04 of eval-pipeline.md).
 * Mirrors `agents/repository.it.test.ts` / `skills/repository.it.test.ts` —
 * a real testcontainers Postgres, direct workspace/agent row setup, no
 * app/routes (pure repository-layer concern).
 */

let stop: () => Promise<void>;
let db: Db;
let repo: EvalRepository;
const WS_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_WS_ID = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url);
  db = handle.db;
  stop = handle.close;
  await db.insert(t.workspaces).values({ id: WS_ID, name: 'test-workspace' }).onConflictDoNothing();
  await db
    .insert(t.workspaces)
    .values({ id: OTHER_WS_ID, name: 'other-workspace' })
    .onConflictDoNothing();
  repo = new EvalRepository(db);
}, 60_000);

afterAll(() => stop());

let agentSeq = 0;
async function makeAgent(workspaceId: string) {
  const name = ['eval-test-agent', agentSeq++].join('-');
  const [row] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name,
      provider: 'openrouter',
      model: 'test-model',
      systemPrompt: 'be helpful',
    })
    .returning();
  return row!;
}

const expectedOutput: EvalCaseInput['expected_output'] = [
  { type: 'must_find', file: 'src/foo.ts', start_line: 1, end_line: 5, severity: 'WARNING' },
];

function caseInput(overrides: Partial<EvalCaseInput> = {}): EvalCaseInput {
  return {
    owner_kind: 'agent',
    owner_id: overrides.owner_id ?? '',
    name: 'a case',
    input_diff: 'diff --git a/src/foo.ts b/src/foo.ts\n',
    expected_output: expectedOutput,
    ...overrides,
  };
}

describe('EvalRepository — eval-case CRUD', () => {
  it('create + list returns only owner_kind=agent rows for the given owner', async () => {
    const agent = await makeAgent(WS_ID);
    const other = await makeAgent(WS_ID);

    await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'case-a' }));
    await repo.createCase(WS_ID, caseInput({ owner_id: other.id, name: 'case-b' }));
    // A skill-owned case sharing the same owner_id space must never leak in.
    await repo.createCase(WS_ID, caseInput({ owner_kind: 'skill', owner_id: agent.id, name: 'case-skill' }));

    const cases = await repo.listCasesForAgent(WS_ID, agent.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.name).toBe('case-a');
    expect(cases[0]?.owner_kind).toBe('agent');
    expect(cases[0]?.expected_output).toEqual(expectedOutput);
  });

  it('getCase / updateCase / deleteCase round-trip, workspace-scoped', async () => {
    const agent = await makeAgent(WS_ID);
    const created = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'edit-me' }));

    const got = await repo.getCase(WS_ID, created.id);
    expect(got?.name).toBe('edit-me');

    const updated = await repo.updateCase(WS_ID, created.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');

    // Not visible from another workspace.
    const crossWs = await repo.getCase(OTHER_WS_ID, created.id);
    expect(crossWs).toBeUndefined();

    const deleted = await repo.deleteCase(WS_ID, created.id);
    expect(deleted).toBe(true);
    expect(await repo.getCase(WS_ID, created.id)).toBeUndefined();
  });

  it('casesBackedByFindings returns the set of source_finding_ids already used (AC-26)', async () => {
    const agent = await makeAgent(WS_ID);
    const findingId = '11111111-1111-1111-1111-111111111111';
    const unusedFindingId = '22222222-2222-2222-2222-222222222222';

    await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'from-finding' }), findingId);

    const backed = await repo.casesBackedByFindings([findingId, unusedFindingId]);
    expect(backed.has(findingId)).toBe(true);
    expect(backed.has(unusedFindingId)).toBe(false);
  });
});

describe('EvalRepository — per-case run persistence', () => {
  it('lastRunForCase returns undefined for a case that has never run', async () => {
    const agent = await makeAgent(WS_ID);
    const created = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'never-run' }));

    const last = await repo.lastRunForCase(created.id);
    expect(last).toBeUndefined();
  });

  it('insertEvalRun with batchId=NULL is a scratch run and becomes lastRunForCase', async () => {
    const agent = await makeAgent(WS_ID);
    const created = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'scratch-run' }));

    const run = await repo.insertEvalRun({
      caseId: created.id,
      batchId: null,
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      actualOutput: [],
      durationMs: 120,
      costUsd: 0.001,
    });
    expect(run.case_id).toBe(created.id);
    expect(run.pass).toBe(true);

    const last = await repo.lastRunForCase(created.id);
    expect(last?.id).toBe(run.id);
    expect(last?.pass).toBe(true);
  });

  it('a later run supersedes an earlier one as lastRunForCase', async () => {
    const agent = await makeAgent(WS_ID);
    const created = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'supersede' }));

    await repo.insertEvalRun({
      caseId: created.id,
      batchId: null,
      pass: false,
      recall: 0,
      precision: null,
      citationAccuracy: null,
      actualOutput: [],
      durationMs: 10,
      costUsd: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await repo.insertEvalRun({
      caseId: created.id,
      batchId: null,
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      actualOutput: [],
      durationMs: 10,
      costUsd: null,
    });

    const last = await repo.lastRunForCase(created.id);
    expect(last?.id).toBe(second.id);
    expect(last?.pass).toBe(true);
  });

  it('lastRunsForAgentCases returns a case whose ONLY run is a scratch run (batchId=NULL) with its pass/fail — R2/AC-4 (G7)', async () => {
    const agent = await makeAgent(WS_ID);
    const scratchOnly = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'scratch-only' }));
    const neverRun = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'never-run' }));

    await repo.insertEvalRun({
      caseId: scratchOnly.id,
      batchId: null,
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      actualOutput: [],
      durationMs: 20,
      costUsd: null,
    });

    const lastRuns = await repo.lastRunsForAgentCases(WS_ID, agent.id);
    const byCase = new Map(lastRuns.map((r) => [r.case_id, r]));

    expect(byCase.get(scratchOnly.id)?.pass).toBe(true);
    expect(byCase.has(neverRun.id)).toBe(false); // never run -> absent, not a fabricated row
  });

  it('lastRunsForAgentCases returns the single LATEST run per case across both a batch run and a later scratch run', async () => {
    const agent = await makeAgent(WS_ID);
    const created = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'mixed-history' }));

    const batch = await repo.insertBatch({
      agentId: agent.id,
      agentVersion: 1,
      recall: 0,
      precision: 0,
      citationAccuracy: 0,
      passCount: 0,
      totalCount: 1,
      costUsd: null,
    });
    await repo.insertEvalRun({
      caseId: created.id,
      batchId: batch.id,
      pass: false,
      recall: 0,
      precision: 0,
      citationAccuracy: 0,
      actualOutput: [],
      durationMs: 10,
      costUsd: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    const later = await repo.insertEvalRun({
      caseId: created.id,
      batchId: null,
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      actualOutput: [],
      durationMs: 10,
      costUsd: null,
    });

    const lastRuns = await repo.lastRunsForAgentCases(WS_ID, agent.id);
    const forCase = lastRuns.filter((r) => r.case_id === created.id);
    expect(forCase).toHaveLength(1); // one row per case, not one per run
    expect(forCase[0]?.id).toBe(later.id);
    expect(forCase[0]?.pass).toBe(true);
  });

  it('lastRunsForAgentCases is workspace-scoped and never leaks another workspace\'s agent cases', async () => {
    const otherAgent = await makeAgent(OTHER_WS_ID);
    const otherCase = await repo.createCase(OTHER_WS_ID, caseInput({ owner_id: otherAgent.id, name: 'other-ws-case' }));
    await repo.insertEvalRun({
      caseId: otherCase.id,
      batchId: null,
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      actualOutput: [],
      durationMs: 5,
      costUsd: null,
    });

    const leaked = await repo.lastRunsForAgentCases(WS_ID, otherAgent.id);
    expect(leaked).toHaveLength(0);
  });
});

describe('EvalRepository — batch persistence + dashboard reads', () => {
  it('insertBatch + insertEvalRun(batchId) round-trip', async () => {
    const agent = await makeAgent(WS_ID);
    const created = await repo.createCase(WS_ID, caseInput({ owner_id: agent.id, name: 'batched' }));

    const batch = await repo.insertBatch({
      agentId: agent.id,
      agentVersion: 1,
      recall: 0.5,
      precision: 0.75,
      citationAccuracy: 1,
      passCount: 1,
      totalCount: 2,
      costUsd: 0.02,
    });
    expect(batch.agent_id).toBe(agent.id);
    expect(batch.agent_version).toBe(1);

    const run = await repo.insertEvalRun({
      caseId: created.id,
      batchId: batch.id,
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      actualOutput: [],
      durationMs: 50,
      costUsd: 0.01,
    });
    expect(run.case_id).toBe(created.id);

    const runs = await repo.runsForBatch(WS_ID, batch.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(run.id);
    expect(runs[0]?.case_name).toBe('batched');

    const fetchedBatch = await repo.getBatch(WS_ID, batch.id);
    expect(fetchedBatch?.id).toBe(batch.id);

    // Not visible from another workspace (agents.workspace_id join scoping).
    expect(await repo.getBatch(OTHER_WS_ID, batch.id)).toBeUndefined();
  });

  it('listBatchesForAgent / batchTrendForAgent / latestBatchPerAgent / recentBatches', async () => {
    const agent = await makeAgent(WS_ID);
    const other = await makeAgent(WS_ID);

    const b1 = await repo.insertBatch({
      agentId: agent.id,
      agentVersion: 1,
      recall: 0.4,
      precision: 0.6,
      citationAccuracy: 0.9,
      passCount: 1,
      totalCount: 3,
      costUsd: 0.01,
    });
    await new Promise((r) => setTimeout(r, 5));
    const b2 = await repo.insertBatch({
      agentId: agent.id,
      agentVersion: 2,
      recall: 0.8,
      precision: 0.9,
      citationAccuracy: 0.95,
      passCount: 3,
      totalCount: 3,
      costUsd: 0.02,
    });
    await repo.insertBatch({
      agentId: other.id,
      agentVersion: 1,
      recall: null,
      precision: null,
      citationAccuracy: null,
      passCount: 0,
      totalCount: 0,
      costUsd: null,
    });

    const agentBatches = await repo.listBatchesForAgent(WS_ID, agent.id);
    expect(agentBatches.map((b) => b.id)).toEqual([b2.id, b1.id]); // newest first

    const trend = await repo.batchTrendForAgent(WS_ID, agent.id);
    expect(trend.map((b) => b.id)).toEqual([b1.id, b2.id]); // chronological

    const latest = await repo.latestBatchPerAgent(WS_ID);
    expect(latest.get(agent.id)?.id).toBe(b2.id);

    const recent = await repo.recentBatches(WS_ID, 10);
    expect(recent.some((r) => r.id === b2.id && r.agent_name === agent.name)).toBe(true);
  });
});
