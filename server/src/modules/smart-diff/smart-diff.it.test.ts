import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockGitHubClient, MockGitClient, MockLLMProvider } from '../../adapters/mocks.js';
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { SmartDiff, LineContextResponse, type RepoRef } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = ['smart-diff-test', repoSeq++].join('-');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: ['acme', name].join('/') })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 100 + repoSeq,
      title: 'Add smart diff test',
      author: 'test.user',
      branch: 'feat/smart-diff',
      base: 'main',
      headSha: 'deadbeef',
      additions: 5,
      deletions: 2,
      filesCount: 3,
      status: 'needs_review',
      body: null,
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('SmartDiff endpoint (Testcontainers pg)', () => {
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

  function buildSmartDiffApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // SmartDiffService makes no LLM calls, but Container requires the key;
        // provide MockGitHubClient to prevent any real GitHub token lookup.
        github: new MockGitHubClient(),
      },
    });
  }

  function buildAppWithFiles(files: Record<string, string>) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: new MockGitClient({ files }),
      },
    });
  }

  it('GET /pulls/:id/smart-diff returns 200 and a valid SmartDiff body', async () => {
    const app = await buildSmartDiffApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Seed a mix: one boilerplate file and one core file
    await pg.handle.db.insert(t.prFiles).values([
      {
        prId: pr.id,
        path: 'package-lock.json',
        additions: 10,
        deletions: 5,
        patch: '',
      },
      {
        prId: pr.id,
        path: 'src/services/auth.ts',
        additions: 20,
        deletions: 3,
        patch: '@@ -1,3 +1,4 @@\n+import crypto from "crypto";',
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'smart-diff'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    // Response must parse through SmartDiff Zod schema without errors
    expect(() => SmartDiff.parse(res.json())).not.toThrow();

    // A file with a non-null patch must round-trip through the response
    const body = res.json() as { groups: { files: { patch: string | null }[] }[] };
    const allFiles = body.groups.flatMap((g) => g.files);
    const withPatch = allFiles.find((f) => f.patch !== null && f.patch !== '');
    expect(withPatch).toBeDefined();

    await app.close();
  });

  it('A known boilerplate file appears in the boilerplate group', async () => {
    const app = await buildSmartDiffApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values([
      {
        prId: pr.id,
        path: 'package-lock.json',
        additions: 3,
        deletions: 1,
        patch: '',
      },
      {
        prId: pr.id,
        path: 'src/lib/utils.ts',
        additions: 8,
        deletions: 0,
        patch: '',
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'smart-diff'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());

    const boilerplateGroup = body.groups.find((g) => g.role === 'boilerplate');
    expect(boilerplateGroup).toBeDefined();
    const paths = boilerplateGroup!.files.map((f) => f.path);
    expect(paths).toContain('package-lock.json');

    await app.close();
  });

  it('A file with a seeded finding has non-empty findings with line and severity', async () => {
    const app = await buildSmartDiffApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const CORE_FILE = 'src/auth/handler.ts';

    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: CORE_FILE,
      additions: 15,
      deletions: 2,
      patch: '',
    });

    // Seed a review with one finding on the core file
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: null,
        runId: null,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'test review',
        score: 50,
        model: 'test',
      })
      .returning();

    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: CORE_FILE,
      startLine: 42,
      endLine: 44,
      severity: 'WARNING',
      category: 'security',
      title: 'Hardcoded credential',
      rationale: 'Secret leaked',
      suggestion: null,
      confidence: 0.9,
      kind: 'finding',
    });

    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'smart-diff'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());

    // Find the file across all groups
    const allFiles = body.groups.flatMap((g) => g.files);
    const found = allFiles.find((f) => f.path === CORE_FILE);
    expect(found).toBeDefined();
    expect(found!.findings.length).toBeGreaterThan(0);
    expect(found!.findings[0]!.line).toBe(42);
    expect(found!.findings[0]!.severity).toBe('WARNING');

    await app.close();
  });

  it('GET /pulls/:id/smart-diff returns 404 for an unknown or cross-workspace PR id', async () => {
    const app = await buildSmartDiffApp();

    // Use a valid UUID that does not belong to any PR in this workspace
    const unknownId = '00000000-0000-0000-0000-000000000001';
    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', unknownId, 'smart-diff'].join('/'),
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('GET /pulls/:id/line-context returns a window of lines around the target line', async () => {
    const FILE = 'src/example.ts';
    const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const app = await buildAppWithFiles({ [FILE]: content });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'GET',
      url: `/pulls/${pr.id}/line-context?file=${encodeURIComponent(FILE)}&line=10`,
    });

    expect(res.statusCode).toBe(200);
    const body = LineContextResponse.parse(res.json());
    expect(body.file).toBe(FILE);
    expect(body.target_line).toBe(10);
    // Radius 5 -> lines 5..15
    expect(body.lines[0]).toEqual({ line: 5, content: 'line 5' });
    expect(body.lines.at(-1)).toEqual({ line: 15, content: 'line 15' });
    expect(body.lines.find((l) => l.line === 10)).toEqual({ line: 10, content: 'line 10' });

    await app.close();
  });

  it('GET /pulls/:id/line-context clamps the window at the start of the file', async () => {
    const FILE = 'src/short.ts';
    const content = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join('\n');
    const app = await buildAppWithFiles({ [FILE]: content });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'GET',
      url: `/pulls/${pr.id}/line-context?file=${encodeURIComponent(FILE)}&line=2`,
    });

    expect(res.statusCode).toBe(200);
    const body = LineContextResponse.parse(res.json());
    expect(body.lines[0]).toEqual({ line: 1, content: 'line 1' });
    expect(body.lines.at(-1)).toEqual({ line: 7, content: 'line 7' });

    await app.close();
  });

  it('GET /pulls/:id/line-context returns 404 when the requested line is out of range', async () => {
    const FILE = 'src/example.ts';
    const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const app = await buildAppWithFiles({ [FILE]: content });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'GET',
      url: `/pulls/${pr.id}/line-context?file=${encodeURIComponent(FILE)}&line=500`,
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('GET /pulls/:id/line-context retries via fetchPullHead when the head commit is not yet in the local mirror', async () => {
    const FILE = 'src/example.ts';
    const content = Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n');

    // Simulates the common case for a just-opened/demo PR: the local clone
    // only tracks the default branch, so `showFile` at the PR's head sha
    // fails until `fetchPullHead` pulls that commit object in.
    class FlakyGitClient extends MockGitClient {
      public fetchCalls = 0;
      private attempts = 0;
      async fetchPullHead(): Promise<void> {
        this.fetchCalls++;
        return super.fetchPullHead();
      }
      async showFile(repo: RepoRef, ref: string, path: string): Promise<string> {
        this.attempts++;
        if (this.attempts === 1) throw new Error('object not found locally');
        return super.showFile(repo, ref, path);
      }
    }
    const git = new FlakyGitClient({ files: { [FILE]: content } });

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient(), git },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'GET',
      url: `/pulls/${pr.id}/line-context?file=${encodeURIComponent(FILE)}&line=3`,
    });

    expect(res.statusCode).toBe(200);
    const body = LineContextResponse.parse(res.json());
    expect(body.lines.find((l) => l.line === 3)).toEqual({ line: 3, content: 'line 3' });
    expect(git.fetchCalls).toBe(1);

    await app.close();
  });

  it('GET /pulls/:id/line-context returns 404 for an unknown PR id', async () => {
    const app = await buildAppWithFiles({});
    const unknownId = '00000000-0000-0000-0000-000000000002';

    const res = await app.inject({
      method: 'GET',
      url: `/pulls/${unknownId}/line-context?file=src/example.ts&line=1`,
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  function buildAppWithLLM(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        // smart_diff_summary's default provider is 'openrouter' (platform.ts
        // FEATURE_MODELS) — the override-map KEY is what container.llm(provider)
        // resolves; the MockLLMProvider id ('openai') is unrelated to the key.
        llm: { openrouter: llm },
      },
    });
  }

  it('POST .../smart-diff/file-summary issues exactly one LLM call, persists, and a subsequent GET .../smart-diff includes it', async () => {
    const FILE = 'src/middleware/ratelimit.ts';
    const llm = new MockLLMProvider('openai', {
      completionText: 'New token-bucket limiter: read bucketKey -> Redis INCR -> if over limit return 429, else next().',
    });
    const app = await buildAppWithLLM(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: FILE,
      additions: 12,
      deletions: 0,
      patch: '@@ -24,0 +25,8 @@\n+  const key = bucketKey(req);\n+  const count = await redis.incr(key);',
    });

    const postRes = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'smart-diff/file-summary'].join('/'),
      payload: { file: FILE },
    });

    expect(postRes.statusCode).toBe(200);
    const postBody = postRes.json();
    expect(postBody.file).toBe(FILE);
    expect(postBody.summary).toContain('token-bucket limiter');
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    const getRes = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'smart-diff'].join('/'),
    });
    const body = SmartDiff.parse(getRes.json());
    const found = body.groups.flatMap((g) => g.files).find((f) => f.path === FILE);
    expect(found?.pseudocode_summary).toContain('token-bucket limiter');

    // GET must read the persisted row, never re-generate — call count stays at 1.
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    await app.close();
  });

  it('a second file-summary generate upserts in place — one row per (pr_id, file_path), latest content wins', async () => {
    const FILE = 'src/middleware/ratelimit.ts';
    const app1 = await buildAppWithLLM(new MockLLMProvider('openai', { completionText: 'v1 summary' }));
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: FILE,
      additions: 1,
      deletions: 0,
      patch: '@@ -1,0 +2 @@\n+x',
    });

    await app1.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'smart-diff/file-summary'].join('/'),
      payload: { file: FILE },
    });
    await app1.close();

    const app2 = await buildAppWithLLM(new MockLLMProvider('openai', { completionText: 'v2 summary' }));
    const secondRes = await app2.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'smart-diff/file-summary'].join('/'),
      payload: { file: FILE },
    });

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.json().summary).toBe('v2 summary');

    const rows = await pg.handle.db
      .select()
      .from(t.prFileSummaries)
      .where(eq(t.prFileSummaries.prId, pr.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe('v2 summary');

    await app2.close();
  });

  it('POST .../smart-diff/file-summary returns 404 for a file not part of this PR\'s diff', async () => {
    const app = await buildAppWithLLM(new MockLLMProvider('openai', { completionText: 'unused' }));
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'smart-diff/file-summary'].join('/'),
      payload: { file: 'src/not-in-this-pr.ts' },
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('POST .../smart-diff/file-summary returns 400 for a file with no patch', async () => {
    const FILE = 'package-lock.json';
    const app = await buildAppWithLLM(new MockLLMProvider('openai', { completionText: 'unused' }));
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: FILE,
      additions: 3,
      deletions: 1,
      patch: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'smart-diff/file-summary'].join('/'),
      payload: { file: FILE },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});
