import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { RepoIntel, BlastResult } from '../repo-intel/types.js';
import * as t from '../../db/schema.js';

/**
 * Integration test for the Blast Radius "Explain" persistence roundtrip (real
 * Postgres via testcontainers). Mirrors intent.it.test.ts: buildApp against
 * pg.handle.db, seed, look up the demo workspace, insert a repo+PR, then drive
 * routes end-to-end. `repoIntel` is stubbed (deterministic BlastResult, no real
 * clone/index needed — same stub shape used in routes.test.ts) so the ONLY
 * real-DB surface under test is the `pr_blast_summary` persist/read roundtrip
 * and the LLM call count across POST + GET.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function stubRepoIntel(blast: BlastResult): RepoIntel {
  return {
    indexRepo: vi.fn(),
    refreshIndex: vi.fn(),
    getIndexState: vi.fn(),
    getBlastRadius: vi.fn().mockResolvedValue(blast),
    getRepoMap: vi.fn(),
    getFileRank: vi.fn(),
    getSymbolsInFiles: vi.fn(),
    getCallerSignatures: vi.fn(),
    getUnresolvedReferences: vi.fn(),
    getConventionSamples: vi.fn(),
    getTopFilesByRank: vi.fn(),
    getCriticalPaths: vi.fn(),
  } as unknown as RepoIntel;
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = ['blast-test', repoSeq++].join('-');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: ['acme', name].join('/') })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/foo.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -1,1 +1,2 @@\n line1\n+line2',
  });
  return { repo: repo!, pr: pr! };
}

d('Blast Radius summary persistence (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function buildBlastApp(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // blast_summary's default provider is 'openrouter' (platform.ts
        // FEATURE_MODELS) — the override-map KEY is what container.llm(provider)
        // resolves; the MockLLMProvider id ('openai') is unrelated to the key.
        llm: { openrouter: llm },
        repoIntel: stubRepoIntel({
          changedSymbols: [{ file: 'src/foo.ts', name: 'foo', kind: 'function' }],
          callers: [{ file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'foo', line: 10, rank: 1 }],
          impactedEndpoints: [],
        }),
      },
    });
  }

  it('POST .../summary persists a summary; a subsequent GET returns it without a second LLM call', async () => {
    const llm = new MockLLMProvider('openai', { completionText: 'Changing foo affects one caller.' });
    const app = await buildBlastApp(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const postRes = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'blast/summary'].join('/'),
    });

    expect(postRes.statusCode).toBe(200);
    const postBody = postRes.json();
    expect(postBody.summary).toBe('Changing foo affects one caller.');
    expect(postBody.pr_id).toBe(pr.id);
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    const getRes = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'blast'].join('/'),
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.summary).toBe('Changing foo affects one caller.');
    expect(getBody.pr_id).toBe(pr.id);

    // The GET must read the persisted row, never re-generate — call count stays at 1.
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    await app.close();
  });

  it('GET .../blast before any Explain call returns an empty summary and makes zero LLM calls', async () => {
    const llm = new MockLLMProvider('openai', { completionText: 'should not be used' });
    const app = await buildBlastApp(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'blast'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toBe('');
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });
});
