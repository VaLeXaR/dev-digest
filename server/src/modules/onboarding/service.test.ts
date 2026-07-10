import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMProvider, OnboardingLlmOutput, OnboardingTour } from '@devdigest/shared';
import type { RepoIntel, IndexState } from '../repo-intel/types.js';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService } from './service.js';

vi.mock('../settings/feature-models.js', () => ({
  resolveFeatureModel: vi.fn(),
}));

/**
 * Hermetic tests for OnboardingService — no DB, no Docker. `OnboardingService`
 * constructs its own `new ReviewRepository(container.db)` and
 * `new OnboardingRepository(container.db)` internally (no DI seam), so we
 * patch the prototypes (server INSIGHTS 2026-07-02), matching
 * `blast/service.test.ts`.
 */

const REPO_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function buildRepoRow(overrides: Partial<{ workspaceId: string }> = {}) {
  return {
    id: REPO_ID,
    workspaceId: WORKSPACE_ID,
    owner: 'acme',
    name: 'demo',
    fullName: 'acme/demo',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildIndexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    status: 'full',
    filesIndexed: 42,
    filesSkipped: 0,
    durationMs: 100,
    repoId: REPO_ID,
    lastIndexedSha: 'sha-abc123',
    indexerVersion: 1,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    degraded: false,
    ...overrides,
  };
}

/** Stub covering the whole `RepoIntel` facade — every method is a `vi.fn()`
 *  unless a fixture value is given. `buildOnboardingFacts` (T-03) reads
 *  getIndexState/getTopFilesByRank/getFileRank/getCriticalPaths/getRepoMap. */
function stubRepoIntel(opts: {
  indexState: IndexState;
  topPaths?: string[];
  fileRank?: { path: string; percentile: number }[];
  criticalPathChains?: string[][];
  repoSkeleton?: string;
}): RepoIntel {
  return {
    indexRepo: vi.fn(),
    refreshIndex: vi.fn(),
    getIndexState: vi.fn().mockResolvedValue(opts.indexState),
    getBlastRadius: vi.fn(),
    getRepoMap: vi.fn().mockResolvedValue({
      text: opts.repoSkeleton ?? 'src/\n  a.ts\n  b.ts',
      tokens: 10,
      cached: false,
    }),
    getFileRank: vi.fn().mockResolvedValue(
      opts.fileRank ?? [
        { path: 'src/a.ts', percentile: 95 },
        { path: 'src/b.ts', percentile: 80 },
      ],
    ),
    getSymbolsInFiles: vi.fn(),
    getCallerSignatures: vi.fn(),
    getUnresolvedReferences: vi.fn(),
    getConventionSamples: vi.fn(),
    getTopFilesByRank: vi.fn().mockResolvedValue(opts.topPaths ?? ['src/a.ts', 'src/b.ts']),
    getCriticalPaths: vi.fn().mockResolvedValue(opts.criticalPathChains ?? [['src/a.ts', 'src/b.ts']]),
  } as unknown as RepoIntel;
}

function buildLlmProvider(completeStructured: ReturnType<typeof vi.fn>): LLMProvider {
  return {
    id: 'openrouter',
    listModels: vi.fn(),
    complete: vi.fn(),
    completeStructured,
    embed: vi.fn(),
  } as unknown as LLMProvider;
}

function buildContainer(opts: { repoIntel: RepoIntel; llm: LLMProvider }): Container {
  return {
    db: {} as never,
    repoIntel: opts.repoIntel,
    llm: vi.fn().mockResolvedValue(opts.llm),
  } as unknown as Container;
}

/** Extra path ('src/unknown.ts') is not in the deterministic critical-path
 *  list — used to assert R4/AC-5 drop behaviour. */
const LLM_FIXTURE: OnboardingLlmOutput = {
  architecture: { summary: 'A small service.', diagram: 'graph TD; A-->B;' },
  criticalPaths: [
    { path: 'src/a.ts', why: 'Entry point.' },
    { path: 'src/unknown.ts', why: 'Not part of the provided list.' },
  ],
  runLocally: { commands: [{ command: 'pnpm install', comment: 'install deps' }] },
  readingPath: [{ path: 'src/a.ts', reason: 'Start here.' }],
  firstTasks: [{ title: 'Fix the bug', rationale: 'Because.', relatedFiles: ['src/a.ts'] }],
};

function structuredResultFixture() {
  return {
    data: LLM_FIXTURE,
    model: 'deepseek/deepseek-v4-flash',
    tokensIn: 1200,
    tokensOut: 400,
    costUsd: 0.0025,
    raw: '{}',
    attempts: 1,
  };
}

describe('OnboardingService', () => {
  let getRepoSpy: any;
  let getTourSpy: any;
  let upsertTourSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.mocked(resolveFeatureModel).mockResolvedValue({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    getRepoSpy = vi.spyOn(ReviewRepository.prototype, 'getRepo').mockResolvedValue(buildRepoRow());
    getTourSpy = vi.spyOn(OnboardingRepository.prototype, 'getTour').mockResolvedValue(null);
    upsertTourSpy = vi.spyOn(OnboardingRepository.prototype, 'upsertTour').mockResolvedValue(undefined);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generate() — success', () => {
    it('calls completeStructured exactly once and upserts the merged tour (R25/AC-31)', async () => {
      const completeStructured = vi.fn().mockResolvedValue(structuredResultFixture());
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      const result = await service.generate(REPO_ID, WORKSPACE_ID);

      expect(completeStructured).toHaveBeenCalledTimes(1);
      expect(upsertTourSpy).toHaveBeenCalledTimes(1);
      expect(result.state).toBe('ready');
    });

    it('drops an LLM-returned path absent from the deterministic critical-paths list (R4/AC-5)', async () => {
      const completeStructured = vi.fn().mockResolvedValue(structuredResultFixture());
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      const result = await service.generate(REPO_ID, WORKSPACE_ID);

      expect(result.state).toBe('ready');
      const tour = (result as { state: 'ready'; tour: OnboardingTour }).tour;
      expect(tour.criticalPaths.map((c) => c.path)).toEqual(['src/a.ts', 'src/b.ts']);
      expect(tour.criticalPaths.some((c) => c.path === 'src/unknown.ts')).toBe(false);
      // Annotated path keeps its LLM `why`; unannotated deterministic path
      // (no matching LLM entry) still renders, with an empty why (R23/AC-29).
      expect(tour.criticalPaths.find((c) => c.path === 'src/a.ts')?.why).toBe('Entry point.');
      expect(tour.criticalPaths.find((c) => c.path === 'src/b.ts')?.why).toBe('');
    });

    it('logs one structured line with model/tokensIn/tokensOut/costUsd (R25/AC-31)', async () => {
      const completeStructured = vi.fn().mockResolvedValue(structuredResultFixture());
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      await service.generate(REPO_ID, WORKSPACE_ID);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logged = String(consoleLogSpy.mock.calls[0]![0]);
      expect(logged).toContain('model=deepseek/deepseek-v4-flash');
      expect(logged).toContain('tokensIn=1200');
      expect(logged).toContain('tokensOut=400');
      expect(logged).toContain('costUsd=0.0025');
    });
  });

  describe('generate() — index required (R9/AC-11)', () => {
    it('returns index_required with zero completeStructured calls when the repo is unindexed', async () => {
      const completeStructured = vi.fn().mockResolvedValue(structuredResultFixture());
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState({ degraded: true, filesIndexed: 0 }) }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      const result = await service.generate(REPO_ID, WORKSPACE_ID);

      expect(result).toEqual({ state: 'index_required' });
      expect(completeStructured).not.toHaveBeenCalled();
      expect(upsertTourSpy).not.toHaveBeenCalled();
    });
  });

  describe('generate() — schema mismatch (R6/AC-7/AC-8)', () => {
    it('throws, persists nothing, and leaves a pre-seeded row unchanged', async () => {
      const preSeededTour = {
        architecture: { summary: 'Old summary.', diagram: 'graph TD; X-->Y;' },
        criticalPaths: [],
        runLocally: { aiGenerated: true as const, commands: [] },
        readingPath: [],
        firstTasks: [],
        meta: { filesIndexed: 10, generatedAt: '2025-01-01T00:00:00.000Z', indexedAtSha: 'old-sha' },
      };
      getTourSpy.mockResolvedValue(preSeededTour);

      const completeStructured = vi
        .fn()
        .mockRejectedValue(new Error('completeStructured: schema validation failed after retries'));
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      await expect(service.generate(REPO_ID, WORKSPACE_ID)).rejects.toThrow(
        'completeStructured: schema validation failed after retries',
      );
      expect(upsertTourSpy).not.toHaveBeenCalled();

      // The prior row is untouched — a subsequent get() still sees it as-is.
      const after = await service.get(REPO_ID, WORKSPACE_ID);
      expect(after).toEqual({ state: 'ready', tour: preSeededTour, currentIndexedSha: 'sha-abc123' });
    });

    it('logs exactly one structured line on failure, with model populated and token/cost fields unavailable (R25/AC-31)', async () => {
      const completeStructured = vi
        .fn()
        .mockRejectedValue(new Error('completeStructured: schema validation failed after retries'));
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      await expect(service.generate(REPO_ID, WORKSPACE_ID)).rejects.toThrow();

      expect(completeStructured).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logged = String(consoleLogSpy.mock.calls[0]![0]);
      expect(logged).toContain('model=deepseek/deepseek-v4-flash');
      expect(logged).toContain('outcome=failure');
      expect(logged).toContain('tokensIn=null');
      expect(logged).toContain('tokensOut=null');
      expect(logged).toContain('costUsd=null');
      expect(upsertTourSpy).not.toHaveBeenCalled();
    });
  });

  describe('get() — no LLM call (R10/AC-12)', () => {
    it('returns not_generated for an indexed repo with no cached tour, without touching the LLM', async () => {
      const completeStructured = vi.fn();
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(completeStructured),
      });
      const service = new OnboardingService(container);

      const result = await service.get(REPO_ID, WORKSPACE_ID);

      expect(result).toEqual({ state: 'not_generated' });
      expect(completeStructured).not.toHaveBeenCalled();
    });

    it('returns index_required for an unindexed repo', async () => {
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState({ degraded: true, filesIndexed: 0 }) }),
        llm: buildLlmProvider(vi.fn()),
      });
      const service = new OnboardingService(container);

      const result = await service.get(REPO_ID, WORKSPACE_ID);

      expect(result).toEqual({ state: 'index_required' });
    });
  });

  describe('workspace scoping', () => {
    it('throws NotFoundError when the repo does not belong to the workspace', async () => {
      getRepoSpy.mockResolvedValue(buildRepoRow({ workspaceId: 'some-other-workspace' }));
      const container = buildContainer({
        repoIntel: stubRepoIntel({ indexState: buildIndexState() }),
        llm: buildLlmProvider(vi.fn()),
      });
      const service = new OnboardingService(container);

      await expect(service.get(REPO_ID, WORKSPACE_ID)).rejects.toThrow(NotFoundError);
    });
  });
});
