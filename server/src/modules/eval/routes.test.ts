import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EvalCase, EvalRunBatchRecord, EvalRunRecord } from '@devdigest/shared';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider } from '../../adapters/mocks.js';
import { EvalService } from './service.js';

/**
 * Route-level tests for the eval module via app.inject() — no DB, no Docker
 * (postgres-js connects lazily; nothing here reaches it since
 * `EvalService.prototype` is patched, mirroring `blast/routes.test.ts` /
 * `agents/routes.test.ts` — there is no DI seam for `EvalService`, it is
 * constructed fresh per-request inside `routes.ts` from `container`).
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const CASE_ID = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const FINDING_ID = '55555555-5555-4555-8555-555555555555';

async function makeApp() {
  return buildApp({
    config,
    overrides: {
      auth: new MockAuthProvider(
        { id: 'u1', email: 'you@local', name: 'You' },
        { id: WORKSPACE_ID, name: 'default' },
      ),
    },
  });
}

function buildBatchRecord(overrides: Partial<EvalRunBatchRecord> = {}): EvalRunBatchRecord {
  return {
    id: BATCH_ID,
    agent_id: AGENT_ID,
    agent_version: 1,
    ran_at: '2026-07-15T00:00:00Z',
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    pass_count: 1,
    total_count: 1,
    cost_usd: 0.01,
    ...overrides,
  };
}

function buildEvalCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: CASE_ID,
    owner_kind: 'agent',
    owner_id: AGENT_ID,
    name: 'Test case',
    input_diff: 'diff --git a/x b/x',
    input_files: [],
    input_meta: {},
    expected_output: [],
    notes: null,
    ...overrides,
  };
}

function buildRunRecord(overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id: 'run-1',
    case_id: CASE_ID,
    case_name: 'Test case',
    ran_at: '2026-07-15T00:00:00Z',
    actual_output: [],
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 100,
    cost_usd: 0.01,
    ...overrides,
  };
}

describe('POST /agents/:id/eval-runs (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the whole set and returns the batch record', async () => {
    const batch = buildBatchRecord();
    vi.spyOn(EvalService.prototype, 'runSet').mockResolvedValue(batch);

    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/agents/${AGENT_ID}/eval-runs` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(batch);
    await app.close();
  });
});

describe('POST /agents/:id/eval-cases/from-finding (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and returns the eval case', async () => {
    const created = buildEvalCase();
    vi.spyOn(EvalService.prototype, 'createCaseFromFinding').mockResolvedValue(created);

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/eval-cases/from-finding`,
      payload: { finding_id: FINDING_ID },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
    await app.close();
  });

  it('rejects a body missing `finding_id` (422, zod validation)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/eval-cases/from-finding`,
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

describe('POST /agents/:id/eval-cases (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and returns the eval case', async () => {
    const created = buildEvalCase();
    vi.spyOn(EvalService.prototype, 'createCase').mockResolvedValue(created);

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/eval-cases`,
      payload: {
        owner_kind: 'agent',
        owner_id: AGENT_ID,
        name: 'Test case',
        expected_output: [],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
    await app.close();
  });

  it('rejects a body missing required `expected_output` (422, zod validation)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/eval-cases`,
      payload: { owner_kind: 'agent', owner_id: AGENT_ID, name: 'Bad case' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

describe('GET /agents/:id/eval-cases (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the agent set', async () => {
    vi.spyOn(EvalService.prototype, 'listCases').mockResolvedValue([buildEvalCase()]);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/eval-cases` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([buildEvalCase()]);
    await app.close();
  });
});

describe('GET /agents/:id/eval-cases/last-runs (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the per-case latest-run list, including a scratch-run (batch-less) case', async () => {
    const scratchRun = buildRunRecord({ id: 'run-scratch', case_id: 'case-scratch', pass: true });
    vi.spyOn(EvalService.prototype, 'lastRunsForAgent').mockResolvedValue([scratchRun]);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/eval-cases/last-runs` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([scratchRun]);
    await app.close();
  });
});

describe('PATCH /eval-cases/:id (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates and returns the case', async () => {
    const updated = buildEvalCase({ name: 'Renamed' });
    vi.spyOn(EvalService.prototype, 'updateCase').mockResolvedValue(updated);

    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${CASE_ID}`,
      payload: { name: 'Renamed' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(updated);
    await app.close();
  });

  it('returns 404 when the case is unknown', async () => {
    vi.spyOn(EvalService.prototype, 'updateCase').mockResolvedValue(undefined);

    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${CASE_ID}`,
      payload: { name: 'Renamed' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });
});

describe('DELETE /eval-cases/:id (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes the case', async () => {
    vi.spyOn(EvalService.prototype, 'deleteCase').mockResolvedValue(true);

    const app = await makeApp();
    const res = await app.inject({ method: 'DELETE', url: `/eval-cases/${CASE_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});

describe('POST /eval-cases/:id/run (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs one case and returns the run record', async () => {
    const run = buildRunRecord();
    vi.spyOn(EvalService.prototype, 'runCase').mockResolvedValue(run);

    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/eval-cases/${CASE_ID}/run` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(run);
    await app.close();
  });
});

describe('GET /agents/:id/eval/dashboard and GET /eval/dashboard (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('single-agent detail dashboard', async () => {
    const dashboard = {
      owner_kind: 'agent' as const,
      owner_id: AGENT_ID,
      cases_total: 1,
      current: {
        recall: 1,
        precision: 1,
        citation_accuracy: 1,
        traces_passed: 1,
        traces_total: 1,
        cost_usd: 0.01,
      },
      delta: { recall: 0, precision: 0, citation_accuracy: 0 },
      trend: [],
      recent_runs: [],
      alert: null,
    };
    vi.spyOn(EvalService.prototype, 'dashboard').mockResolvedValue(dashboard);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/eval/dashboard` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(dashboard);
    await app.close();
  });

  it('cross-agent overview dashboard', async () => {
    const overview = { agents: [], recent_runs: [] };
    vi.spyOn(EvalService.prototype, 'dashboard').mockResolvedValue(overview as never);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(overview);
    await app.close();
  });
});

describe('GET /agents/:id/eval-batches and GET /eval-batches/:id/runs (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists batch history for an agent', async () => {
    const batches = [buildBatchRecord()];
    vi.spyOn(EvalService.prototype, 'listBatches').mockResolvedValue(batches);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/eval-batches` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(batches);
    await app.close();
  });

  it('lists per-case runs for a batch', async () => {
    const runs = [buildRunRecord()];
    vi.spyOn(EvalService.prototype, 'batchRuns').mockResolvedValue(runs);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/eval-batches/${BATCH_ID}/runs` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(runs);
    await app.close();
  });
});

describe('GET /findings/eval-cases (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the set of finding ids that already back a case', async () => {
    vi.spyOn(EvalService.prototype, 'findingsWithCases').mockResolvedValue(
      new Set([FINDING_ID]),
    );

    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/findings/eval-cases?ids=${FINDING_ID},other-id`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ finding_ids: [FINDING_ID] });
    await app.close();
  });

  it('rejects a missing `ids` querystring param (422, zod validation)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/findings/eval-cases' });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
