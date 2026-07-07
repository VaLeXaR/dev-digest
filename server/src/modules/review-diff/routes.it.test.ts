import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockLLMProvider, MockAuthProvider } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';

/**
 * Integration test for `POST /review/diff`'s DB-backed agent-resolution paths
 * (real Postgres via testcontainers) — the hermetic `service.test.ts` (T-02)
 * only exercises the pure diff->Review path with a directly-constructed
 * service and never touches HTTP/DB/agent lookup at all.
 *
 * Each case gets its own freshly-inserted workspace (via a `MockAuthProvider`
 * override) instead of reusing the seeded demo workspace: `db/seed.ts` always
 * creates 3 *enabled* `openrouter` agents there, so relying on it would make
 * "no enabled agent" unreachable and would make the happy-path's "first
 * enabled agent" pick nondeterministic between the seeded openrouter agents
 * (no override for that provider -> real ConfigError) and our openai one.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// Diff + fixture pair mirroring service.test.ts's SAMPLE_DIFF/fixtureReview —
// the finding's start_line (2) intersects the single hunk's changed range
// ("@@ -1,3 +1,4 @@"), so it survives the citation-grounding gate.
const SAMPLE_DIFF = [
  'diff --git a/src/greet.ts b/src/greet.ts',
  '--- a/src/greet.ts',
  '+++ b/src/greet.ts',
  '@@ -1,3 +1,4 @@',
  ' export function greet(name) {',
  "+  if (!name) throw new Error('name required');",
  '   return name;',
  ' }',
].join('\n');

function fixtureReview(): Review {
  return {
    verdict: 'comment',
    summary: 'One suggestion: guard against empty name.',
    score: 50,
    findings: [
      {
        id: 'f1',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Guard against empty name',
        file: 'src/greet.ts',
        start_line: 2,
        end_line: 2,
        rationale: 'Throwing early avoids returning "Hello, undefined".',
        suggestion: null,
        confidence: 0.8,
      },
    ],
  };
}

let wsSeq = 0;
async function setupWorkspace(db: PgFixture['handle']['db']): Promise<string> {
  const [ws] = await db
    .insert(t.workspaces)
    .values({ name: ['review-diff-test', wsSeq++].join('-') })
    .returning();
  return ws!.id;
}

d('POST /review/diff (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('happy path: 200 with a grounded Review when an enabled openai agent exists', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    await pg.handle.db.insert(t.agents).values({
      workspaceId,
      name: 'Diff Test Agent',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      systemPrompt: 'You are a reviewer.',
      enabled: true,
    });

    const llm = new MockLLMProvider('openai', { structured: fixtureReview() });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'review-diff-test' }),
        llm: { openai: llm },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/review/diff',
      payload: { diff: SAMPLE_DIFF },
    });

    expect(res.statusCode).toBe(200);
    // Response must parse through the shared Review Zod schema without errors.
    const body = Review.parse(res.json());
    expect(body.verdict).toBe('comment');
    expect(typeof body.summary).toBe('string');
    expect(typeof body.score).toBe('number');
    // The fixture finding survived citation-grounding (start_line lands inside
    // the diff hunk sent above).
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0]?.title).toBe('Guard against empty name');

    await app.close();
  });

  it('no enabled agent: 400 with error.code "no_enabled_agent"', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'review-diff-test' }),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/review/diff',
      payload: { diff: SAMPLE_DIFF },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('no_enabled_agent');
    expect(body.error.message).toContain('Enable an agent in the DevDigest UI first.');

    await app.close();
  });

  it('unknown agentId: 404 with error.code "not_found"', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'review-diff-test' }),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/review/diff',
      payload: { diff: SAMPLE_DIFF, agentId: '00000000-0000-0000-0000-000000000099' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');

    await app.close();
  });
});
