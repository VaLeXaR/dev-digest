import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider, MockGitClient, MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import { MultiAgentRunsService } from './service.js';

/**
 * DB-backed integration test for the multi-agent-runs module (T-06). Each
 * case gets its own freshly-inserted workspace (via a `MockAuthProvider`
 * override, same pattern as `review-diff/routes.it.test.ts` /
 * `project-context/routes.it.test.ts`) rather than the seeded demo workspace.
 *
 * `POST .../multi-agent-runs` only needs to be checked up to the point where
 * it RETURNS — `ReviewService.runReview` awaits creating each `agent_runs`
 * row before firing the actual review execution as fire-and-forget
 * (`server/src/modules/reviews/service.ts:135`), so AC-4/AC-5/IDOR/rate-limit
 * assertions never need to wait on background LLM work. The "read returns
 * groups + per-agent totals" (SC-1) and "history derives status" cases seed
 * `agent_runs`/`reviews`/`findings` directly — this exercises the exact same
 * assembly code the real background executor's output would flow through,
 * without depending on a slow/non-deterministic real review run completing
 * (server/INSIGHTS.md 2026-07-17 documents real single-pass review runs as
 * 40-57s and non-deterministic — not suitable for a deterministic assertion).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let wsSeq = 0;
async function setupWorkspace(db: PgFixture['handle']['db']): Promise<string> {
  const [ws] = await db
    .insert(t.workspaces)
    .values({ name: ['multi-agent-runs-test', wsSeq++].join('-') })
    .returning();
  return ws!.id;
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = ['mar-test', repoSeq++].join('-');
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
      title: 'Multi-agent-runs test PR',
      author: 'test.user',
      branch: 'feat/mar-test',
      base: 'main',
      headSha: 'deadbeef',
      additions: 20,
      deletions: 5,
      filesCount: 2,
      status: 'needs_review',
      body: null,
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

async function setupAgent(db: PgFixture['handle']['db'], workspaceId: string, name: string) {
  const [agent] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name,
      provider: 'openai',
      model: 'test-model',
      systemPrompt: 'You are a reviewer.',
      enabled: true,
    })
    .returning();
  return agent!;
}

/** Directly seed one agent_run linked to a multi-agent run, + one review + N findings. */
async function seedLinkedRun(
  db: PgFixture['handle']['db'],
  opts: {
    workspaceId: string;
    prId: string;
    agentId: string;
    multiAgentRunId: string;
    status: 'done' | 'running' | 'failed';
    costUsd?: number | null;
    durationMs?: number | null;
    score?: number | null;
    findings?: { file: string; startLine: number; endLine: number; title: string }[];
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: opts.workspaceId,
      agentId: opts.agentId,
      prId: opts.prId,
      provider: 'openai',
      model: 'test-model',
      status: opts.status,
      costUsd: opts.costUsd ?? null,
      durationMs: opts.durationMs ?? null,
      score: opts.score ?? null,
      tokensIn: 100,
      tokensOut: 50,
      findingsCount: opts.findings?.length ?? 0,
      grounding: '1/1 passed',
      multiAgentRunId: opts.multiAgentRunId,
    })
    .returning();

  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: opts.workspaceId,
      prId: opts.prId,
      agentId: opts.agentId,
      runId: run!.id,
      kind: 'review',
      verdict: 'comment',
      summary: 'Test review',
      score: opts.score ?? null,
      model: 'test-model',
    })
    .returning();

  if (opts.findings && opts.findings.length > 0) {
    await db.insert(t.findings).values(
      opts.findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.endLine,
        severity: 'WARNING',
        category: 'style',
        title: f.title,
        rationale: 'Test rationale',
        confidence: 0.8,
      })),
    );
  }

  return run!;
}

d('multi-agent-runs routes (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildTestApp(workspaceId: string, wsName: string) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: wsName }),
        github: new MockGitHubClient(),
        git: new MockGitClient({}),
        llm: { openai: new MockLLMProvider('openai', { completionText: 'ok' }) },
      },
    });
  }

  it('create persists one multi_agent_runs row + N linked agent_runs (AC-4), and a re-run creates a SECOND row leaving the prior untouched (AC-5)', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = await setupAgent(pg.handle.db, workspaceId, 'Agent A');
    const agentB = await setupAgent(pg.handle.db, workspaceId, 'Agent B');

    const app = await buildTestApp(workspaceId, 'mar-create-test');

    const res1 = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-runs`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { multiRunId: string; runs: { agentId: string; runId: string }[] };
    expect(body1.runs).toHaveLength(2);

    const rows1 = await pg.handle.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.id, body1.multiRunId));
    expect(rows1).toHaveLength(1);

    const linked1 = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, body1.multiRunId));
    expect(linked1).toHaveLength(2);

    // Re-run: a SECOND, distinct multi_agent_runs row; the first's linked
    // agent_runs count must stay exactly 2 (untouched).
    const res2 = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-runs`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json() as { multiRunId: string; runs: unknown[] };
    expect(body2.multiRunId).not.toBe(body1.multiRunId);

    const allRuns = await pg.handle.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.prId, pr.id));
    expect(allRuns).toHaveLength(2);

    const linked1Again = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, body1.multiRunId));
    expect(linked1Again).toHaveLength(2);

    await app.close();
  });

  it('GET /multi-agent-runs/:id from another workspace returns not-found (IDOR, AC-7/AC-8)', async () => {
    const ownerWorkspaceId = await setupWorkspace(pg.handle.db);
    const { pr } = await setupRepoAndPr(pg.handle.db, ownerWorkspaceId);
    const agent = await setupAgent(pg.handle.db, ownerWorkspaceId, 'Agent A');

    const ownerApp = await buildTestApp(ownerWorkspaceId, 'mar-idor-owner');
    const createRes = await ownerApp.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-runs`,
      payload: { agentIds: [agent.id] },
    });
    expect(createRes.statusCode).toBe(200);
    const { multiRunId } = createRes.json() as { multiRunId: string };
    await ownerApp.close();

    // Owner workspace CAN read it.
    const ownerReadApp = await buildTestApp(ownerWorkspaceId, 'mar-idor-owner');
    const ownerRes = await ownerReadApp.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` });
    expect(ownerRes.statusCode).toBe(200);
    await ownerReadApp.close();

    // A different workspace gets 404, not the other tenant's data.
    const otherWorkspaceId = await setupWorkspace(pg.handle.db);
    const otherApp = await buildTestApp(otherWorkspaceId, 'mar-idor-other');
    const otherRes = await otherApp.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` });
    expect(otherRes.statusCode).toBe(404);
    await otherApp.close();
  });

  it('the CREATE route carries the same 10/min rate-limit config as /pulls/:id/review', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    vi.spyOn(MultiAgentRunsService.prototype, 'createMultiRun').mockResolvedValue({
      multiRunId: randomUUID(),
      runs: [],
    });

    const app = await buildTestApp(workspaceId, 'mar-ratelimit-test');
    const prId = randomUUID();
    let capturedConfig: { rateLimit?: { max: number; timeWindow: string } } | undefined;
    app.addHook('onRequest', async (req) => {
      if (req.url === `/pulls/${prId}/multi-agent-runs`) {
        capturedConfig = req.routeOptions.config as typeof capturedConfig;
      }
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/multi-agent-runs`,
      payload: { agentIds: [randomUUID()] },
    });

    expect(res.statusCode).toBe(200);
    expect(capturedConfig?.rateLimit).toEqual({ max: 10, timeWindow: '1 minute' });

    await app.close();
  });

  it('read returns cross-agent groups + per-agent totals (SC-1)', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = await setupAgent(pg.handle.db, workspaceId, 'Agent A');
    const agentB = await setupAgent(pg.handle.db, workspaceId, 'Agent B');

    const [multiRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({
        workspaceId,
        prId: pr.id,
        selectedAgentIds: [agentA.id, agentB.id],
        status: 'running',
        estimatedCostUsd: null,
        estimatedDurationMs: null,
      })
      .returning();

    // Both agents flag the SAME issue at an overlapping range (essence-similar
    // titles) -> one group, both 'flagged' (no conflict). Agent A also has a
    // cost/duration/score total.
    await seedLinkedRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA.id,
      multiAgentRunId: multiRun!.id,
      status: 'done',
      costUsd: 0.05,
      durationMs: 4000,
      score: 80,
      findings: [
        { file: 'src/example.ts', startLine: 10, endLine: 12, title: 'Unvalidated webhook URL allows SSRF' },
      ],
    });
    await seedLinkedRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentB.id,
      multiAgentRunId: multiRun!.id,
      status: 'done',
      costUsd: 0.1,
      durationMs: 6000,
      score: 90,
      findings: [
        { file: 'src/example.ts', startLine: 11, endLine: 13, title: 'SSRF via unvalidated webhook URL' },
      ],
    });

    const app = await buildTestApp(workspaceId, 'mar-read-test');
    const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRun!.id}` });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      status: string;
      agents: { agentId: string; costUsd: number | null; durationMs: number | null }[];
      groups: { file: string; verdicts: { agentId: string; state: string }[]; isConflict: boolean }[];
    };
    expect(body.status).toBe('complete');
    expect(body.agents).toHaveLength(2);
    const totalsByAgent = new Map(body.agents.map((a) => [a.agentId, a]));
    expect(totalsByAgent.get(agentA.id)?.costUsd).toBe(0.05);
    expect(totalsByAgent.get(agentB.id)?.costUsd).toBe(0.1);

    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]!.file).toBe('src/example.ts');
    expect(body.groups[0]!.isConflict).toBe(false);
    expect(body.groups[0]!.verdicts).toHaveLength(2);
    expect(body.groups[0]!.verdicts.every((v) => v.state === 'flagged')).toBe(true);

    await app.close();
  });

  it('the history list derives status for a run whose detail page was never opened (not a stale "running")', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = await setupAgent(pg.handle.db, workspaceId, 'Agent A');
    const agentB = await setupAgent(pg.handle.db, workspaceId, 'Agent B');

    const [multiRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({
        workspaceId,
        prId: pr.id,
        selectedAgentIds: [agentA.id, agentB.id],
        // Written as 'running' at creation (T-06) and NEVER updated afterwards —
        // the row itself stays 'running' forever; only derived-on-read status
        // should reflect completion.
        status: 'running',
        estimatedCostUsd: null,
        estimatedDurationMs: null,
      })
      .returning();

    await seedLinkedRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA.id,
      multiAgentRunId: multiRun!.id,
      status: 'done',
      costUsd: 0.02,
      durationMs: 2000,
    });
    await seedLinkedRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentB.id,
      multiAgentRunId: multiRun!.id,
      status: 'done',
      costUsd: 0.03,
      durationMs: 3000,
    });

    const app = await buildTestApp(workspaceId, 'mar-history-test');
    // Deliberately never call GET /multi-agent-runs/:id — only the history list.
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent-runs` });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      id: string;
      status: string;
      agentCount: number;
      totalCostUsd: number | null;
      totalDurationMs: number | null;
    }[];
    const item = body.find((r) => r.id === multiRun!.id);
    expect(item).toBeDefined();
    expect(item!.status).toBe('complete');
    expect(item!.agentCount).toBe(2);
    expect(item!.totalCostUsd).toBeCloseTo(0.05);
    expect(item!.totalDurationMs).toBe(3000);

    await app.close();
  });

  it('DELETE unlinks a run: run is gone but its agent_runs + findings survive with null FK', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await setupAgent(pg.handle.db, workspaceId, 'Agent A');

    const [multiRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({
        workspaceId,
        prId: pr.id,
        selectedAgentIds: [agent.id],
        status: 'running',
        estimatedCostUsd: null,
        estimatedDurationMs: null,
      })
      .returning();

    const agentRun = await seedLinkedRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      multiAgentRunId: multiRun!.id,
      status: 'done',
      findings: [{ file: 'src/example.ts', startLine: 10, endLine: 12, title: 'Some finding' }],
    });

    const app = await buildTestApp(workspaceId, 'mar-delete-test');
    const delRes = await app.inject({ method: 'DELETE', url: `/multi-agent-runs/${multiRun!.id}` });
    expect(delRes.statusCode).toBe(204);

    // The multi-run itself is gone.
    const readRes = await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRun!.id}` });
    expect(readRes.statusCode).toBe(404);

    // The linked agent_run SURVIVES, now unlinked (multi_agent_run_id = NULL).
    const [survivingRun] = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, agentRun.id));
    expect(survivingRun).toBeDefined();
    expect(survivingRun!.multiAgentRunId).toBeNull();

    // Its findings survive too (nothing cascaded away).
    const findings = await pg.handle.db
      .select()
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(eq(t.reviews.runId, agentRun.id));
    expect(findings.length).toBe(1);

    await app.close();
  });

  it('DELETE is workspace-scoped: another workspace gets 404 and the run is untouched', async () => {
    const ownerWorkspaceId = await setupWorkspace(pg.handle.db);
    const { pr } = await setupRepoAndPr(pg.handle.db, ownerWorkspaceId);
    const agent = await setupAgent(pg.handle.db, ownerWorkspaceId, 'Agent A');

    const ownerApp = await buildTestApp(ownerWorkspaceId, 'mar-delete-idor-owner');
    const createRes = await ownerApp.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-runs`,
      payload: { agentIds: [agent.id] },
    });
    expect(createRes.statusCode).toBe(200);
    const { multiRunId } = createRes.json() as { multiRunId: string };
    await ownerApp.close();

    // A different workspace cannot delete it.
    const otherWorkspaceId = await setupWorkspace(pg.handle.db);
    const otherApp = await buildTestApp(otherWorkspaceId, 'mar-delete-idor-other');
    const otherRes = await otherApp.inject({ method: 'DELETE', url: `/multi-agent-runs/${multiRunId}` });
    expect(otherRes.statusCode).toBe(404);
    await otherApp.close();

    // The owner can still read it — the cross-tenant DELETE was a no-op.
    const ownerReadApp = await buildTestApp(ownerWorkspaceId, 'mar-delete-idor-owner');
    const ownerRes = await ownerReadApp.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` });
    expect(ownerRes.statusCode).toBe(200);
    await ownerReadApp.close();
  });
});
