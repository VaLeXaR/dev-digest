import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { GitClient, RunTrace } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, PullRow } from '../../db/rows.js';
import type * as schema from '../../db/schema.js';
import type { LinkedSkillRow } from '../agents/repository.js';
import { RunBus } from '../../platform/sse.js';
import { MockGitClient, MockLLMProvider } from '../../adapters/mocks.js';
import { ReviewRepository, type ReviewRow } from './repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { ReviewRunExecutor } from './run-executor.js';

/**
 * Hermetic tests for T-09 (run-executor Project Context injection). No DB, no
 * Docker: `ReviewRepository`/`SkillsRepository` have no DI seam on
 * `ReviewRunExecutor` (it constructs its own `SkillsRepository` internally,
 * mirroring `BlastService`'s `new ReviewRepository(container.db)` pattern —
 * server INSIGHTS 2026-07-02), so both are patched via `vi.spyOn(...prototype, ...)`.
 * `resolveAttachedSpecs` needs REAL files on disk (it reads raw bytes), so
 * `clonePathFor` is overridden on a `MockGitClient` subclass to point at a
 * temp dir (server INSIGHTS 2026-07-09 — subclassing to override one method
 * is safe and needs no base-mock edits).
 */

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '22222222-2222-4222-8222-222222222222';
const PR_ID = '33333333-3333-4333-8333-333333333333';
const AGENT_ID = '44444444-4444-4444-8444-444444444444';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-executor-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const cleanupDirs: string[] = [];
function trackedTempDir(): string {
  const dir = makeTempDir();
  cleanupDirs.push(dir);
  return dir;
}

/** `MockGitClient` whose `clonePathFor` resolves to a real temp dir (the base
 * mock's `/mock/clones/...` doesn't exist on disk, but the resolver reads
 * real bytes). */
class TempClonePathGitClient extends MockGitClient implements GitClient {
  constructor(private tempClonePath: string) {
    super();
  }
  override clonePathFor(): string {
    return this.tempClonePath;
  }
}

function buildContainer(opts: { git: GitClient; llm?: MockLLMProvider }): Container {
  const llm = opts.llm ?? new MockLLMProvider('openai', { structured: DEFAULT_REVIEW_FIXTURE });
  return {
    db: {} as never,
    runBus: new RunBus(),
    git: opts.git,
    // T-03 (AC-23): executeRuns now reads the bounded-fan-out pool size from
    // container.config — every job here is a single-job list, so any pool
    // size behaves identically to the prior strictly-sequential loop.
    config: { multiAgentConcurrency: 4 } as unknown as Container['config'],
    llm: vi.fn().mockResolvedValue(llm),
  } as unknown as Container;
}

const DEFAULT_REVIEW_FIXTURE = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };

function buildAgentsRepo(opts: {
  contextDocs?: string[];
  skillLinks?: LinkedSkillRow[];
}): Container['agentsRepo'] {
  return {
    linkedSkills: vi.fn().mockResolvedValue(opts.skillLinks ?? []),
    contextDocPaths: vi.fn().mockResolvedValue(opts.contextDocs ?? []),
  } as unknown as Container['agentsRepo'];
}

function buildAgentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: AGENT_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Test Agent',
    description: '',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    systemPrompt: 'You are a careful reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: false, // avoid needing a repoIntel facade in the fake container
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
    agentId: AGENT_ID,
    runId: 'run-1',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks fine.',
    score: 95,
    model: 'gpt-4.1-mini',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as ReviewRow;
}

/** Runs one agent job via the public `executeRuns` entry point and returns the
 * trace that was persisted via `saveRunTrace` for that run. */
async function runOneJobAndCaptureTrace(opts: {
  clonePath: string;
  agentContextDocs?: string[];
  skillLinks?: LinkedSkillRow[];
  skillContextDocsBySkillId?: Record<string, string[]>;
}): Promise<{ trace: RunTrace; completeAgentRunCalls: unknown[][] }> {
  const runId = 'run-1';
  const git = new TempClonePathGitClient(opts.clonePath);
  const container = buildContainer({ git });
  const agentsRepo = buildAgentsRepo({
    contextDocs: opts.agentContextDocs,
    skillLinks: opts.skillLinks,
  });
  const repo = new ReviewRepository({} as never);

  vi.spyOn(ReviewRepository.prototype, 'getIntent').mockResolvedValue(undefined);
  vi.spyOn(ReviewRepository.prototype, 'insertReview').mockResolvedValue(buildReviewRow());
  vi.spyOn(ReviewRepository.prototype, 'insertFindings').mockResolvedValue([]);
  vi.spyOn(ReviewRepository.prototype, 'markReviewed').mockResolvedValue(undefined);
  const completeAgentRunSpy = vi
    .spyOn(ReviewRepository.prototype, 'completeAgentRun')
    .mockResolvedValue(undefined);
  let capturedTrace: RunTrace | undefined;
  vi.spyOn(ReviewRepository.prototype, 'saveRunTrace').mockImplementation(async (_runId, trace) => {
    capturedTrace = trace;
  });

  const bySkillId = opts.skillContextDocsBySkillId ?? {};
  vi.spyOn(SkillsRepository.prototype, 'contextDocPaths').mockImplementation(async (skillId: string) =>
    bySkillId[skillId] ?? [],
  );

  const executor = new ReviewRunExecutor(container, repo, agentsRepo);
  const agent = buildAgentRow();
  const pull = buildPullRow();
  const repoRow = buildRepoRow();

  await executor.executeRuns(WORKSPACE_ID, pull, repoRow, [{ agent, runId }]);

  if (!capturedTrace) throw new Error('saveRunTrace was never called');
  return { trace: capturedTrace, completeAgentRunCalls: completeAgentRunSpy.mock.calls };
}

function buildSkillLink(skillId: string, overrides: Partial<LinkedSkillRow['skill']> = {}): LinkedSkillRow {
  return {
    order: 0,
    enabled: true,
    skill: {
      id: skillId,
      workspaceId: WORKSPACE_ID,
      name: 'Test Skill',
      description: '',
      type: 'custom',
      source: 'manual',
      body: 'Follow the rules.',
      enabled: true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    } as LinkedSkillRow['skill'],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ReviewRunExecutor — Project Context injection (T-09)', () => {
  it('0 attached docs → prompt_assembly.specs is null and no "## Project context" section is rendered', async () => {
    const clonePath = trackedTempDir();

    const { trace, completeAgentRunCalls } = await runOneJobAndCaptureTrace({
      clonePath,
      agentContextDocs: [],
      skillLinks: [],
    });

    expect(completeAgentRunCalls[0]?.[1]).toMatchObject({ status: 'done' });
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.prompt_assembly.specs_snapshot).toEqual([]);
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
  });

  it('an agent + skill sharing one path injects it once, agent-order-wins, and records it once in specs_read', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/shared.md', 'Shared spec content.');
    writeFile(clonePath, 'specs/skill-only.md', 'Skill-only spec content.');

    const skillLink = buildSkillLink('skill-1');

    const { trace } = await runOneJobAndCaptureTrace({
      clonePath,
      // Agent attaches the shared path itself...
      agentContextDocs: ['specs/shared.md'],
      skillLinks: [skillLink],
      // ...and the inherited skill ALSO attaches it (plus one skill-only path).
      skillContextDocsBySkillId: { 'skill-1': ['specs/shared.md', 'specs/skill-only.md'] },
    });

    expect(trace.specs_read).toEqual(['specs/shared.md', 'specs/skill-only.md']);
    expect(trace.prompt_assembly.specs_snapshot).toEqual([
      { path: 'specs/shared.md', content: 'Shared spec content.' },
      { path: 'specs/skill-only.md', content: 'Skill-only spec content.' },
    ]);
    expect(trace.prompt_assembly.specs).not.toBeNull();
    expect(trace.prompt_assembly.user).toContain('## Project context');
  });

  it('a missing (unresolvable) attached path is skipped and the run still completes', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/exists.md', 'Real content.');

    const { trace, completeAgentRunCalls } = await runOneJobAndCaptureTrace({
      clonePath,
      agentContextDocs: ['specs/exists.md', 'specs/missing.md'],
      skillLinks: [],
    });

    expect(completeAgentRunCalls[0]?.[1]).toMatchObject({ status: 'done' });
    expect(trace.specs_read).toEqual(['specs/exists.md']);
    expect(trace.prompt_assembly.specs_snapshot).toEqual([
      { path: 'specs/exists.md', content: 'Real content.' },
    ]);
  });

  it('specs_snapshot content is byte-equal to the raw content injected as the spec', async () => {
    const clonePath = trackedTempDir();
    const rawContent = 'Exact fidelity check: no mutation, no re-encoding drift.';
    writeFile(clonePath, 'specs/fidelity.md', rawContent);

    const { trace } = await runOneJobAndCaptureTrace({
      clonePath,
      agentContextDocs: ['specs/fidelity.md'],
      skillLinks: [],
    });

    expect(trace.prompt_assembly.specs_snapshot).toEqual([{ path: 'specs/fidelity.md', content: rawContent }]);
    // The raw content also made it (untrusted-wrapped) into the assembled prompt.
    expect(trace.prompt_assembly.specs).toContain(rawContent);
  });
});
