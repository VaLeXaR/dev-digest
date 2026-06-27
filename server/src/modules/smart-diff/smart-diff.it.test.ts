import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockGitHubClient } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import { SmartDiff } from '@devdigest/shared';

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

  it('A file with a seeded finding has non-empty finding_lines', async () => {
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
    expect(found!.finding_lines.length).toBeGreaterThan(0);
    expect(found!.finding_lines).toContain(42);

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
});
