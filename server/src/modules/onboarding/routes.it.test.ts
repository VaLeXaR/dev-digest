import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider, MockLLMProvider } from '../../adapters/mocks.js';
import type { RepoIntel, IndexState } from '../repo-intel/types.js';
import type { OnboardingLlmOutput } from '@devdigest/shared';
import * as t from '../../db/schema.js';

/**
 * Integration test for the onboarding routes (real Postgres via
 * testcontainers). Mirrors blast.it.test.ts / intent.it.test.ts:
 * `repoIntel` is stubbed (deterministic facts, no real clone/index needed)
 * and `llm` is overridden with a `MockLLMProvider` keyed by the
 * `onboarding` feature model's default provider ('openrouter') — the ONLY
 * real-DB surface under test is the `onboarding` table persist/read
 * roundtrip through the actual routes + service + repository.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function buildIndexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    status: 'full',
    filesIndexed: 5,
    filesSkipped: 0,
    durationMs: 10,
    repoId: 'unused',
    lastIndexedSha: 'sha-abc123',
    indexerVersion: 1,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    degraded: false,
    ...overrides,
  };
}

function stubRepoIntel(indexState: IndexState): RepoIntel {
  return {
    indexRepo: vi.fn(),
    refreshIndex: vi.fn(),
    getIndexState: vi.fn().mockResolvedValue(indexState),
    getBlastRadius: vi.fn(),
    getRepoMap: vi.fn().mockResolvedValue({ text: 'src/\n  a.ts', tokens: 5, cached: false }),
    getFileRank: vi.fn().mockResolvedValue([{ path: 'src/a.ts', percentile: 90 }]),
    getSymbolsInFiles: vi.fn(),
    getCallerSignatures: vi.fn(),
    getUnresolvedReferences: vi.fn(),
    getConventionSamples: vi.fn(),
    getTopFilesByRank: vi.fn().mockResolvedValue(['src/a.ts']),
    getCriticalPaths: vi.fn().mockResolvedValue([['src/a.ts']]),
  } as unknown as RepoIntel;
}

const LLM_FIXTURE: OnboardingLlmOutput = {
  architecture: { summary: 'A tiny service.', diagram: 'graph TD; A-->B;' },
  criticalPaths: [{ path: 'src/a.ts', why: 'Entry point.' }],
  runLocally: { commands: [{ command: 'pnpm install', comment: 'install deps' }] },
  readingPath: [{ path: 'src/a.ts', reason: 'Start here.' }],
  firstTasks: [{ title: 'Fix the bug', rationale: 'Because.' }],
};

d('Onboarding routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let wsSeq = 0;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(
    indexState: IndexState,
    llm: MockLLMProvider,
  ): Promise<{ app: FastifyInstance; repoId: string; workspaceId: string }> {
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: ['onboarding-test', wsSeq++].join('-') })
      .returning();
    const workspaceId = ws!.id;

    const name = ['onboarding-repo', repoSeq++].join('-');
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: ['acme', name].join('/') })
      .returning();

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'onboarding-test' }),
        repoIntel: stubRepoIntel(indexState),
        // onboarding's default feature-model provider is 'openrouter'
        // (platform.ts FEATURE_MODELS) — the override-map KEY is what
        // container.llm(provider) resolves; MockLLMProvider's own `id` is
        // unrelated to the key (mirrors blast.it.test.ts / intent.it.test.ts).
        llm: { openrouter: llm },
      },
    });

    return { app, repoId: repo!.id, workspaceId };
  }

  it('GET /repos/:id/onboarding on an unindexed repo returns index_required with no LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const { app, repoId } = await setup(buildIndexState({ degraded: true, filesIndexed: 0 }), llm);

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: 'index_required' });
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('POST /repos/:id/onboarding/generate on an unindexed repo returns index_required with no LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const { app, repoId } = await setup(buildIndexState({ degraded: true, filesIndexed: 0 }), llm);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: 'index_required' });
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('GET /repos/:id/onboarding on an indexed repo with no cached tour returns not_generated', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const { app, repoId } = await setup(buildIndexState(), llm);

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: 'not_generated' });
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('POST generate persists a tour; a subsequent GET returns it ready without a second LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const { app, repoId } = await setup(buildIndexState(), llm);

    const genRes = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(genRes.statusCode).toBe(200);
    const genBody = genRes.json();
    expect(genBody.state).toBe('ready');
    expect(genBody.tour.architecture.summary).toBe('A tiny service.');
    expect(genBody.currentIndexedSha).toBe('sha-abc123');
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const getRes = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.state).toBe('ready');
    expect(getBody.tour).toEqual(genBody.tour);

    // GET must read the persisted row, never re-generate — call count stays at 1.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await app.close();
  });

  it('rejects a repo belonging to a different workspace with 404 (workspace isolation / IDOR)', async () => {
    const ownerLlm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const owner = await setup(buildIndexState(), ownerLlm);
    const intruderLlm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const intruder = await setup(buildIndexState(), intruderLlm);

    const getRes = await intruder.app.inject({
      method: 'GET',
      url: `/repos/${owner.repoId}/onboarding`,
    });
    expect(getRes.statusCode).toBe(404);

    const genRes = await intruder.app.inject({
      method: 'POST',
      url: `/repos/${owner.repoId}/onboarding/generate`,
    });
    expect(genRes.statusCode).toBe(404);
    expect(intruderLlm.calls).toHaveLength(0);

    await owner.app.close();
    await intruder.app.close();
  });
});
