import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LLMProvider, Provider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, PullRow } from '../../db/rows.js';
import type * as schema from '../../db/schema.js';
import { RunBus } from '../../platform/sse.js';
import { loadConfig } from '../../platform/config.js';
import { MockGitClient } from '../../adapters/mocks.js';
import { ReviewRepository, type ReviewRow } from './repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { ReviewRunExecutor } from './run-executor.js';

/**
 * Hermetic tests for T-03 (bounded-concurrency executor fan-out, AC-23). No
 * DB, no Docker, no network: `ReviewRepository`/`SkillsRepository` are
 * patched via `vi.spyOn(...prototype, ...)` (same pattern as
 * run-executor.test.ts — no DI seam for either on `ReviewRunExecutor`, see
 * server INSIGHTS 2026-07-02). Each job is given its own provider id
 * ('openai'/'anthropic'/'openrouter') so `container.llm` can return a
 * distinct, independently-timed/failing stub per job — real `setTimeout`
 * delays (not fake timers) so wall-clock overlap between concurrent
 * `runOneAgent` calls is directly observable.
 */

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '22222222-2222-4222-8222-222222222222';
const PR_ID = '33333333-3333-4333-8333-333333333333';

const DEFAULT_REVIEW_FIXTURE = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };

function buildAgentRow(id: string, provider: Provider, overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    name: `Agent ${id}`,
    description: '',
    provider,
    model: 'test-model',
    systemPrompt: 'You are a careful reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: false,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AgentRow;
}

function buildPullRow(overrides: Partial<PullRow> = {}): PullRow {
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
    openedAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PullRow;
}

function buildRepoRow(
  overrides: Partial<typeof schema.repos.$inferSelect> = {},
): typeof schema.repos.$inferSelect {
  return {
    id: REPO_ID,
    workspaceId: WORKSPACE_ID,
    owner: 'acme',
    name: 'widgets',
    fullName: 'acme/widgets',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as typeof schema.repos.$inferSelect;
}

function buildReviewRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: 'review-1',
    workspaceId: WORKSPACE_ID,
    prId: PR_ID,
    agentId: 'agent-x',
    runId: 'run-x',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks fine.',
    score: 95,
    model: 'test-model',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as ReviewRow;
}

function buildAgentsRepo(): Container['agentsRepo'] {
  return {
    linkedSkills: vi.fn().mockResolvedValue([]),
    contextDocPaths: vi.fn().mockResolvedValue([]),
  } as unknown as Container['agentsRepo'];
}

type TimelineEntry = { label: string; start: number; end: number };

/** A minimal `LLMProvider` whose `completeStructured` sleeps `delayMs` (real
 * timer) then resolves the fixture or rejects, recording its own [start,end]
 * window into `timeline` — used to prove concurrent vs. sequential fan-out. */
function makeTimedLLM(opts: {
  id: Provider;
  label: string;
  delayMs: number;
  fail?: boolean;
  timeline: TimelineEntry[];
}): LLMProvider {
  return {
    id: opts.id,
    listModels: vi.fn().mockResolvedValue([]),
    complete: vi.fn(),
    embed: vi.fn(),
    completeStructured: vi.fn(async (req: StructuredRequest<unknown>): Promise<StructuredResult<unknown>> => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, opts.delayMs));
      const end = Date.now();
      opts.timeline.push({ label: opts.label, start, end });
      if (opts.fail) throw new Error(`${opts.label} provider failure`);
      const parsed = req.schema.safeParse(DEFAULT_REVIEW_FIXTURE);
      if (!parsed.success) throw new Error(`fixture failed schema: ${parsed.error.message}`);
      return {
        data: parsed.data,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.0001,
        raw: JSON.stringify(DEFAULT_REVIEW_FIXTURE),
        attempts: 1,
      };
    }),
  } as unknown as LLMProvider;
}

function buildContainer(opts: {
  llmByProvider: Partial<Record<Provider, LLMProvider>>;
  multiAgentConcurrency: number;
}): Container {
  return {
    db: {} as never,
    runBus: new RunBus(),
    git: new MockGitClient(),
    config: { multiAgentConcurrency: opts.multiAgentConcurrency } as unknown as Container['config'],
    llm: vi.fn(async (id: Provider) => {
      const provider = opts.llmByProvider[id];
      if (!provider) throw new Error(`no stub LLM registered for provider ${id}`);
      return provider;
    }),
  } as unknown as Container;
}

function spyRepo() {
  vi.spyOn(ReviewRepository.prototype, 'getIntent').mockResolvedValue(undefined);
  vi.spyOn(ReviewRepository.prototype, 'insertReview').mockImplementation(async (input) =>
    buildReviewRow({ agentId: input.agentId, runId: input.runId }),
  );
  vi.spyOn(ReviewRepository.prototype, 'insertFindings').mockResolvedValue([]);
  vi.spyOn(ReviewRepository.prototype, 'markReviewed').mockResolvedValue(undefined);
  const completeAgentRunSpy = vi
    .spyOn(ReviewRepository.prototype, 'completeAgentRun')
    .mockResolvedValue(undefined);
  vi.spyOn(ReviewRepository.prototype, 'saveRunTrace').mockResolvedValue(undefined);
  vi.spyOn(SkillsRepository.prototype, 'contextDocPaths').mockResolvedValue([]);
  return { completeAgentRunSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReviewRunExecutor — bounded-concurrency fan-out (T-03/AC-23)', () => {
  it('agent A rejects while B and C resolve — B and C still complete (per-agent isolation preserved)', async () => {
    const timeline: TimelineEntry[] = [];
    const container = buildContainer({
      multiAgentConcurrency: 4,
      llmByProvider: {
        openai: makeTimedLLM({ id: 'openai', label: 'A', delayMs: 20, fail: true, timeline }),
        anthropic: makeTimedLLM({ id: 'anthropic', label: 'B', delayMs: 20, timeline }),
        openrouter: makeTimedLLM({ id: 'openrouter', label: 'C', delayMs: 20, timeline }),
      },
    });
    const { completeAgentRunSpy } = spyRepo();
    const agentsRepo = buildAgentsRepo();
    const repo = new ReviewRepository({} as never);
    const executor = new ReviewRunExecutor(container, repo, agentsRepo);

    const jobs = [
      { agent: buildAgentRow('agent-a', 'openai'), runId: 'run-a' },
      { agent: buildAgentRow('agent-b', 'anthropic'), runId: 'run-b' },
      { agent: buildAgentRow('agent-c', 'openrouter'), runId: 'run-c' },
    ];

    await executor.executeRuns(WORKSPACE_ID, buildPullRow(), buildRepoRow(), jobs);

    const statusByRunId = new Map<string, string>();
    for (const call of completeAgentRunSpy.mock.calls) {
      const [runId, patch] = call as [string, { status: string }];
      statusByRunId.set(runId, patch.status);
    }
    expect(statusByRunId.get('run-a')).toBe('failed');
    expect(statusByRunId.get('run-b')).toBe('done');
    expect(statusByRunId.get('run-c')).toBe('done');
  });

  it('three concurrent runOneAgent calls overlap in time rather than running strictly end-to-end', async () => {
    const timeline: TimelineEntry[] = [];
    const container = buildContainer({
      multiAgentConcurrency: 4,
      llmByProvider: {
        openai: makeTimedLLM({ id: 'openai', label: 'A', delayMs: 40, timeline }),
        anthropic: makeTimedLLM({ id: 'anthropic', label: 'B', delayMs: 40, timeline }),
        openrouter: makeTimedLLM({ id: 'openrouter', label: 'C', delayMs: 40, timeline }),
      },
    });
    spyRepo();
    const agentsRepo = buildAgentsRepo();
    const repo = new ReviewRepository({} as never);
    const executor = new ReviewRunExecutor(container, repo, agentsRepo);

    const jobs = [
      { agent: buildAgentRow('agent-a', 'openai'), runId: 'run-a' },
      { agent: buildAgentRow('agent-b', 'anthropic'), runId: 'run-b' },
      { agent: buildAgentRow('agent-c', 'openrouter'), runId: 'run-c' },
    ];

    await executor.executeRuns(WORKSPACE_ID, buildPullRow(), buildRepoRow(), jobs);

    expect(timeline).toHaveLength(3);
    // Sequential execution would produce three strictly disjoint windows
    // (each starting only after the previous ended). Concurrent fan-out
    // starts all three close together, so every pair's interval overlaps.
    const overlaps = (a: TimelineEntry, b: TimelineEntry) => a.start < b.end && b.start < a.end;
    const [a, b, c] = timeline as [TimelineEntry, TimelineEntry, TimelineEntry];
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, c)).toBe(true);
    expect(overlaps(a, c)).toBe(true);
  });

  it('N=1 run path is unchanged — a single job still completes normally under the bounded pool', async () => {
    const timeline: TimelineEntry[] = [];
    const container = buildContainer({
      multiAgentConcurrency: 4,
      llmByProvider: {
        openai: makeTimedLLM({ id: 'openai', label: 'solo', delayMs: 5, timeline }),
      },
    });
    const { completeAgentRunSpy } = spyRepo();
    const agentsRepo = buildAgentsRepo();
    const repo = new ReviewRepository({} as never);
    const executor = new ReviewRunExecutor(container, repo, agentsRepo);

    await executor.executeRuns(WORKSPACE_ID, buildPullRow(), buildRepoRow(), [
      { agent: buildAgentRow('agent-solo', 'openai'), runId: 'run-solo' },
    ]);

    expect(completeAgentRunSpy.mock.calls).toHaveLength(1);
    const [runId, patch] = completeAgentRunSpy.mock.calls[0] as [string, { status: string }];
    expect(runId).toBe('run-solo');
    expect(patch.status).toBe('done');
  });

  it('pool size reads from MULTI_AGENT_CONCURRENCY (via AppConfig) and defaults to 4 when unset', async () => {
    // (a) loadConfig itself: default is 4, and the env var overrides it.
    expect(loadConfig({} as NodeJS.ProcessEnv).multiAgentConcurrency).toBe(4);
    expect(
      loadConfig({ MULTI_AGENT_CONCURRENCY: '2' } as unknown as NodeJS.ProcessEnv).multiAgentConcurrency,
    ).toBe(2);

    // (b) the executor actually bounds its fan-out by container.config value
    // (not a hardcoded literal): 5 jobs, pool=2 → peak concurrency must be
    // exactly 2, never all 5 at once.
    const timeline: TimelineEntry[] = [];
    const providers: Provider[] = ['openai', 'anthropic', 'openrouter'];
    const llmByProvider: Partial<Record<Provider, LLMProvider>> = {};
    // Reuse the 3 available Provider ids across 5 jobs — container.llm is
    // keyed by provider, not by job, and multiple jobs may share a provider.
    for (const id of providers) {
      llmByProvider[id] = makeTimedLLM({ id, label: id, delayMs: 30, timeline });
    }
    const container = buildContainer({ multiAgentConcurrency: 2, llmByProvider });
    spyRepo();
    const agentsRepo = buildAgentsRepo();
    const repo = new ReviewRepository({} as never);
    const executor = new ReviewRunExecutor(container, repo, agentsRepo);

    const jobs = [
      { agent: buildAgentRow('agent-1', 'openai'), runId: 'run-1' },
      { agent: buildAgentRow('agent-2', 'anthropic'), runId: 'run-2' },
      { agent: buildAgentRow('agent-3', 'openrouter'), runId: 'run-3' },
      { agent: buildAgentRow('agent-4', 'openai'), runId: 'run-4' },
      { agent: buildAgentRow('agent-5', 'anthropic'), runId: 'run-5' },
    ];

    await executor.executeRuns(WORKSPACE_ID, buildPullRow(), buildRepoRow(), jobs);

    expect(timeline).toHaveLength(5);
    // Peak concurrency = max number of overlapping [start,end) intervals at
    // any instant. Half-open: when one job's end and another's start land in
    // the SAME millisecond (Date.now() resolution / real-timer coalescing),
    // the end must be processed first — a job ending at T does not overlap
    // one starting at T. Getting this tie-break backwards over-counts peak
    // by 1 purely from clock-resolution artifacts, not a real pool breach
    // (the pool itself can never exceed `limit`: `next++` is synchronous).
    const events = timeline.flatMap((t) => [
      { time: t.start, delta: 1 },
      { time: t.end, delta: -1 },
    ]);
    events.sort((x, y) => x.time - y.time || x.delta - y.delta);
    let current = 0;
    let peak = 0;
    for (const e of events) {
      current += e.delta;
      peak = Math.max(peak, current);
    }
    expect(peak).toBe(2);
  });
});
