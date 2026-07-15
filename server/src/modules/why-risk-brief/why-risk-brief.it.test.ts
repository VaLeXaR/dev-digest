import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { CompletionRequest, CompletionResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider, MockGitHubClient, MockGitClient } from '../../adapters/mocks.js';
import type { RepoIntel, BlastResult } from '../repo-intel/types.js';
import * as t from '../../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Integration test for Why+Risk Brief route wiring + persistence (real
 * Postgres via testcontainers). Mirrors intent.it.test.ts/blast.it.test.ts:
 * buildApp against pg.handle.db, seed, insert a repo+PR, drive routes
 * end-to-end. `repoIntel` is stubbed (deterministic BlastResult, no real
 * clone/index needed) so the ONLY real-DB surface under test is the
 * `pr_why_risk_brief` persist/read roundtrip and the LLM call count.
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

/** Deterministic empty blast (no callers) — keeps the assembled input simple. */
const EMPTY_BLAST: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };

/** An LLM stub whose complete() always throws — simulates a provider/network failure (AC-8). */
class ThrowingLLMProvider extends MockLLMProvider {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    throw new Error('LLM provider unavailable');
  }
}

const BRIEF_JSON = JSON.stringify({
  what: 'Adds rate limiting to public endpoints.',
  why: 'Prevent abuse from repeated requests.',
  risk_level: 'medium',
  risks: [],
  review_focus: [{ file: 'src/foo.ts', line: 12, reason: 'New limiter logic lives here' }],
});

const BRIEF_JSON_V2 = JSON.stringify({
  what: 'Adds rate limiting to public endpoints (v2).',
  why: 'Prevent abuse from repeated requests (v2).',
  risk_level: 'high',
  risks: [],
  review_focus: [],
});

/** Temp clone dirs for the AC-6/AC-11 spec-path test — real fs, cleaned up per-test. */
const cleanupDirs: string[] = [];
function tempCloneDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'why-risk-brief-clone-'));
  cleanupDirs.push(dir);
  return dir;
}
function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = ['brief-test', repoSeq++].join('-');
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

/**
 * Same shape as setupRepoAndPr, but the repo carries a real `clonePath` and
 * the changed file shares a directory prefix ('specs/') with a discoverable
 * Context-Folder doc — the setup needed to exercise selectOverlappingSpecs
 * (AC-14) and, downstream, the resolvableRefs spec-path fix (AC-6/AC-11).
 */
async function setupRepoAndPrWithClone(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  clonePath: string,
) {
  const name = ['brief-spec-test', repoSeq++].join('-');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: ['acme', name].join('/'), clonePath })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add a widget',
      author: 'marisa.koch',
      branch: 'feat/widget',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add a widget.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'specs/feature.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -1,1 +1,2 @@\n line1\n+line2',
  });
  return { repo: repo!, pr: pr! };
}

d('Why+Risk Brief endpoints (Testcontainers pg)', () => {
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

  afterEach(() => {
    while (cleanupDirs.length) {
      const dir = cleanupDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function buildBriefApp(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // why_risk_brief's default provider is 'openai' (platform.ts FEATURE_MODELS).
        llm: { openai: llm },
        repoIntel: stubRepoIntel(EMPTY_BLAST),
        github: new MockGitHubClient({ detail: { linked_issue: null } }),
      },
    });
  }

  it('GET /pulls/:id/brief returns 404 before generation and issues 0 LLM calls (SC1)', async () => {
    const llm = new MockLLMProvider('openai', { completionText: 'should not be used' });
    const app = await buildBriefApp(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'brief'].join('/'),
    });

    expect(res.statusCode).toBe(404);
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('POST .../brief/generate issues exactly one LLM call, persists, and a subsequent GET returns it', async () => {
    const llm = new MockLLMProvider('openai', { completionText: BRIEF_JSON });
    const app = await buildBriefApp(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const postRes = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'brief/generate'].join('/'),
    });

    expect(postRes.statusCode).toBe(200);
    const postBody = postRes.json();
    expect(postBody.what).toBe('Adds rate limiting to public endpoints.');
    expect(postBody.why).toBe('Prevent abuse from repeated requests.');
    expect(postBody.risk_level).toBe('medium');
    expect(postBody.review_focus).toEqual([
      { file: 'src/foo.ts', line: 12, reason: 'New limiter logic lives here' },
    ]);
    expect(postBody.pr_id).toBe(pr.id);
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    const getRes = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'brief'].join('/'),
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.what).toBe(postBody.what);
    expect(getBody.risk_level).toBe('medium');
    expect(getBody.pr_id).toBe(pr.id);

    // GET must read the persisted row, never re-generate — call count stays at 1.
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    await app.close();
  });

  it('a second generate upserts in place — one row, latest content wins', async () => {
    const llm1 = new MockLLMProvider('openai', { completionText: BRIEF_JSON });
    const app1 = await buildBriefApp(llm1);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await app1.inject({ method: 'POST', url: ['/pulls', pr.id, 'brief/generate'].join('/') });
    await app1.close();

    const llm2 = new MockLLMProvider('openai', { completionText: BRIEF_JSON_V2 });
    const app2 = await buildBriefApp(llm2);

    const secondRes = await app2.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'brief/generate'].join('/'),
    });

    expect(secondRes.statusCode).toBe(200);
    const secondBody = secondRes.json();
    expect(secondBody.risk_level).toBe('high');
    expect(secondBody.what).toBe('Adds rate limiting to public endpoints (v2).');

    const rows = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    expect(rows).toHaveLength(1);

    await app2.close();
  });

  it('an LLM failure with no prior brief yields a non-5xx response carrying the deterministic empty brief (AC-8)', async () => {
    const llm = new ThrowingLLMProvider('openai');
    const app = await buildBriefApp(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'brief/generate'].join('/'),
    });

    expect(res.statusCode).toBeLessThan(500);
    const body = res.json();
    expect(body).toMatchObject({
      what: '',
      why: '',
      risk_level: 'low',
      risks: [],
      review_focus: [],
      pr_id: pr.id,
    });

    await app.close();
  });

  it('an LLM failure with a prior brief yields a non-5xx response carrying the prior brief (AC-8)', async () => {
    const okLlm = new MockLLMProvider('openai', { completionText: BRIEF_JSON });
    const okApp = await buildBriefApp(okLlm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await okApp.inject({ method: 'POST', url: ['/pulls', pr.id, 'brief/generate'].join('/') });
    await okApp.close();

    const failingLlm = new ThrowingLLMProvider('openai');
    const failingApp = await buildBriefApp(failingLlm);

    const res = await failingApp.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'brief/generate'].join('/'),
    });

    expect(res.statusCode).toBeLessThan(500);
    const body = res.json();
    expect(body.what).toBe('Adds rate limiting to public endpoints.');
    expect(body.risk_level).toBe('medium');
    expect(body.pr_id).toBe(pr.id);

    await failingApp.close();
  });

  it('a review_focus item pointing at a Context-Folder spec path (not in the diff, not an endpoint) survives the AC-6 filter (AC-6, AC-11)', async () => {
    // The spec doc lives under 'specs/' and shares that directory prefix with
    // the PR's only changed file, so selectOverlappingSpecs (AC-14) selects it
    // into the assembled input's specs[] — resolvableRefs must then include
    // its path, or the LLM's review_focus reference to it is dropped even
    // though it was literally present in what the LLM saw.
    const clonePath = tempCloneDir();
    writeFile(clonePath, 'specs/design.md', 'Design notes for the widget feature.');

    const llm = new MockLLMProvider('openai', {
      completionText: JSON.stringify({
        what: 'Adds a widget.',
        why: 'Needed for feature X.',
        risk_level: 'low',
        risks: [],
        review_focus: [{ file: 'specs/design.md', line: 1, reason: 'Design doc for this change' }],
      }),
    });

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: { openai: llm },
        repoIntel: stubRepoIntel(EMPTY_BLAST),
        github: new MockGitHubClient({ detail: { linked_issue: null } }),
        git: new MockGitClient({ trackedFiles: ['specs/design.md'] }),
      },
    });

    const { pr } = await setupRepoAndPrWithClone(pg.handle.db, workspaceId, clonePath);

    const res = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'brief/generate'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review_focus).toEqual([
      { file: 'specs/design.md', line: 1, reason: 'Design doc for this change' },
    ]);

    await app.close();
  });
});
