import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider, MockGitHubClient } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// Intent fixture — a valid JSON string (complete() returns text, not structured)
const INTENT_JSON = JSON.stringify({
  intent: 'Adds rate limiting',
  in_scope: ['rate limiting'],
  out_of_scope: ['auth'],
});

// Risks fixture — risks extractor also uses complete(), returns empty risks
const RISKS_JSON = '{"risks":[]}';

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = ['intent-test', repoSeq++].join('-');
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
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Intent endpoints (Testcontainers pg)', () => {
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

  function buildIntentApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // review_intent resolves to openrouter; risk_brief resolves to openai.
        // The override-map KEY is what container.llm(provider) resolves — the
        // MockLLMProvider id ('openai') is unrelated to the map key.
        llm: {
          openrouter: new MockLLMProvider('openai', { completionText: INTENT_JSON }),
          openai: new MockLLMProvider('openai', { completionText: RISKS_JSON }),
        },
        // Prevent the service from attempting a real GitHub token lookup.
        github: new MockGitHubClient(),
      },
    });
  }

  it('POST /pulls/:id/intent/generate returns 200 with intent + pr_id', async () => {
    const app = await buildIntentApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'intent/generate'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toBe('Adds rate limiting');
    expect(body.in_scope).toEqual(['rate limiting']);
    expect(body.out_of_scope).toEqual(['auth']);
    expect(body.pr_id).toBe(pr.id);

    await app.close();
  });

  it('GET /pulls/:id/intent returns the persisted intent after generate', async () => {
    const app = await buildIntentApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Generate first
    await app.inject({
      method: 'POST',
      url: ['/pulls', pr.id, 'intent/generate'].join('/'),
    });

    // Then read back
    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'intent'].join('/'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toBe('Adds rate limiting');
    expect(body.in_scope).toEqual(['rate limiting']);
    expect(body.out_of_scope).toEqual(['auth']);
    expect(body.pr_id).toBe(pr.id);

    await app.close();
  });

  it('GET /pulls/:id/intent returns 404 for a PR with no generated intent', async () => {
    const app = await buildIntentApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // No generate call — intent should be absent
    const res = await app.inject({
      method: 'GET',
      url: ['/pulls', pr.id, 'intent'].join('/'),
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
