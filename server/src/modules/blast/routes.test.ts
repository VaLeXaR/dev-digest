import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider } from '../../adapters/mocks.js';
import { ReviewRepository } from '../reviews/repository.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { BlastResult } from '../repo-intel/types.js';
import type { PullRow } from '../../db/rows.js';

/**
 * Route-level test for GET /pulls/:id/blast via app.inject() — no DB, no
 * Docker. Mirrors test/routes-smoke.test.ts (buildApp + overrides; postgres-js
 * connects lazily so no real Postgres is needed as long as no DB query runs).
 * Auth is overridden with MockAuthProvider so container.auth never touches the
 * DB; ReviewRepository.prototype (constructed internally by BlastService) is
 * patched the same way as service.test.ts since there is no DI seam for it.
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PR_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function buildPrRow(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: PR_ID,
    workspaceId: WORKSPACE_ID,
    repoId: REPO_ID,
    number: 1,
    title: 'Test PR',
    author: 'octocat',
    branch: 'feat/x',
    base: 'main',
    headSha: 'abc123',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PullRow;
}

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

describe('GET /pulls/:id/blast (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with the computed blast radius shape', async () => {
    vi.spyOn(ReviewRepository.prototype, 'getPull').mockResolvedValue(buildPrRow());
    vi.spyOn(ReviewRepository.prototype, 'getPrFiles').mockResolvedValue([
      { id: 'f1', prId: PR_ID, path: 'src/foo.ts', additions: 1, deletions: 0, patch: null },
    ] as never);
    vi.spyOn(ReviewRepository.prototype, 'getBlastSummary').mockResolvedValue(undefined);

    const app = await buildApp({
      config,
      overrides: {
        auth: new MockAuthProvider({ id: 'u1', email: 'you@local', name: 'You' }, { id: WORKSPACE_ID, name: 'default' }),
        repoIntel: stubRepoIntel({
          changedSymbols: [{ file: 'src/foo.ts', name: 'foo', kind: 'function' }],
          callers: [{ file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'foo', line: 10, rank: 1 }],
          impactedEndpoints: [],
        }),
      },
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/blast` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_id).toBe(PR_ID);
    expect(body.changed_symbols).toEqual([{ name: 'foo', file: 'src/foo.ts', kind: 'function' }]);
    expect(body.downstream).toHaveLength(1);
    expect(body.downstream[0]).toEqual({
      symbol: 'foo',
      callers: [{ name: 'callA', file: 'src/callerA.ts', line: 10 }],
      endpoints_affected: [],
      crons_affected: [],
    });
    expect(body.summary).toBe('');

    await app.close();
  });

  it('returns 404 when the PR is unknown', async () => {
    vi.spyOn(ReviewRepository.prototype, 'getPull').mockResolvedValue(undefined);

    const app = await buildApp({
      config,
      overrides: {
        auth: new MockAuthProvider({ id: 'u1', email: 'you@local', name: 'You' }, { id: WORKSPACE_ID, name: 'default' }),
        repoIntel: stubRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
      },
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/blast` });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });
});
