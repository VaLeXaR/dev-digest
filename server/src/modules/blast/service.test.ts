import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RepoIntel } from '../repo-intel/types.js';
import type { BlastResult } from '../repo-intel/types.js';
import type { PullRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BlastService } from './service.js';

vi.mock('../settings/feature-models.js', () => ({
  resolveFeatureModel: vi.fn(),
}));

/**
 * Hermetic tests for BlastService — no DB, no Docker. Mirrors
 * test/repo-intel-facade-degraded.test.ts: inject a stub RepoIntel via
 * ContainerOverrides.repoIntel and mock ReviewRepository.prototype methods
 * (BlastService constructs its own `new ReviewRepository(container.db)`
 * internally, so there is no DI seam for the repo — patch the prototype
 * instead, matching the vi.spyOn pattern already used in
 * src/modules/skills/import.service.test.ts).
 */

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
    openedAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildContainer(opts: {
  repoIntel: RepoIntel;
  llm?: MockLLMProvider;
}): Container {
  const llm = opts.llm ?? new MockLLMProvider('openai');
  return {
    db: {} as never,
    repoIntel: opts.repoIntel,
    llm: vi.fn().mockResolvedValue(llm),
  } as unknown as Container;
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

describe('BlastService', () => {
  // Untyped spy handles: vi.spyOn's overload resolution on this vitest version
  // does not accept a class-instance-method generic constraint cleanly, and each
  // test reassigns a different mock resolution — `any` avoids fighting the
  // inference for a test-only local variable.
  let getPullSpy: any;
  let getBlastSummarySpy: any;
  let upsertBlastSummarySpy: any;

  beforeEach(() => {
    vi.mocked(resolveFeatureModel).mockResolvedValue({ provider: 'openai', model: 'gpt-4.1-mini' });
    getPullSpy = vi.spyOn(ReviewRepository.prototype, 'getPull');
    vi.spyOn(ReviewRepository.prototype, 'getPrFiles').mockResolvedValue([
      { id: 'f1', prId: PR_ID, path: 'src/foo.ts', additions: 1, deletions: 0, patch: null },
    ]);
    getBlastSummarySpy = vi.spyOn(ReviewRepository.prototype, 'getBlastSummary').mockResolvedValue(undefined);
    upsertBlastSummarySpy = vi.spyOn(ReviewRepository.prototype, 'upsertBlastSummary').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get() — grouping and attribution', () => {
    it('groups callers by viaSymbol into DownstreamImpact[]', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const blast: BlastResult = {
        changedSymbols: [
          { file: 'src/foo.ts', name: 'foo', kind: 'function' },
          { file: 'src/bar.ts', name: 'bar', kind: 'function' },
        ],
        callers: [
          { file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'foo', line: 10, rank: 1 },
          { file: 'src/callerB.ts', symbol: 'callB', viaSymbol: 'foo', line: 20, rank: 1 },
          { file: 'src/callerC.ts', symbol: 'callC', viaSymbol: 'bar', line: 5, rank: 1 },
        ],
        impactedEndpoints: [],
      };
      const container = buildContainer({ repoIntel: stubRepoIntel(blast) });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      expect(result.changed_symbols).toEqual([
        { name: 'foo', file: 'src/foo.ts', kind: 'function' },
        { name: 'bar', file: 'src/bar.ts', kind: 'function' },
      ]);
      expect(result.downstream).toHaveLength(2);

      const fooImpact = result.downstream.find((d) => d.symbol === 'foo');
      expect(fooImpact?.callers).toEqual([
        { name: 'callA', file: 'src/callerA.ts', line: 10 },
        { name: 'callB', file: 'src/callerB.ts', line: 20 },
      ]);

      const barImpact = result.downstream.find((d) => d.symbol === 'bar');
      expect(barImpact?.callers).toEqual([{ name: 'callC', file: 'src/callerC.ts', line: 5 }]);
    });

    it('derives endpoints_affected/crons_affected from factsByFile per symbol', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const blast: BlastResult = {
        changedSymbols: [{ file: 'src/foo.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'src/routes/a.ts', symbol: 'handlerA', viaSymbol: 'foo', line: 1, rank: 1 },
          { file: 'src/jobs/b.ts', symbol: 'jobB', viaSymbol: 'foo', line: 2, rank: 1 },
        ],
        impactedEndpoints: ['GET /a'],
        factsByFile: {
          'src/routes/a.ts': { endpoints: ['GET /a'], crons: [] },
          'src/jobs/b.ts': { endpoints: [], crons: ['nightly-sync'] },
        },
      };
      const container = buildContainer({ repoIntel: stubRepoIntel(blast) });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      expect(result.downstream).toHaveLength(1);
      expect(result.downstream[0]!.endpoints_affected).toEqual(['GET /a']);
      expect(result.downstream[0]!.crons_affected).toEqual(['nightly-sync']);
    });

    it('de-duplicates downstream entries when the same symbol name is declared in two different changed files', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const blast: BlastResult = {
        changedSymbols: [
          { file: 'src/modules/pulls/routes.ts', name: 'activeRunsForPull', kind: 'function' },
          { file: 'src/modules/reviews/routes.ts', name: 'activeRunsForPull', kind: 'function' },
        ],
        callers: [
          { file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'activeRunsForPull', line: 10, rank: 1 },
        ],
        impactedEndpoints: [],
      };
      const container = buildContainer({ repoIntel: stubRepoIntel(blast) });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      // changed_symbols still lists both declaring files...
      expect(result.changed_symbols).toHaveLength(2);
      // ...but downstream must collapse to one row per unique symbol NAME,
      // since callers are matched by name only and duplicate rows would show
      // identical caller data (and previously produced duplicate React keys).
      expect(result.downstream).toHaveLength(1);
      expect(result.downstream[0]!.symbol).toBe('activeRunsForPull');
      expect(result.downstream[0]!.callers).toEqual([
        { name: 'callA', file: 'src/callerA.ts', line: 10 },
      ]);
    });

    it('de-duplicates endpoints/crons unioned across multiple caller files for the same symbol', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const blast: BlastResult = {
        changedSymbols: [{ file: 'src/foo.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'src/routes/a.ts', symbol: 'handlerA', viaSymbol: 'foo', line: 1, rank: 1 },
          { file: 'src/routes/a2.ts', symbol: 'handlerA2', viaSymbol: 'foo', line: 3, rank: 1 },
        ],
        impactedEndpoints: ['GET /a'],
        factsByFile: {
          'src/routes/a.ts': { endpoints: ['GET /a'], crons: [] },
          'src/routes/a2.ts': { endpoints: ['GET /a'], crons: [] },
        },
      };
      const container = buildContainer({ repoIntel: stubRepoIntel(blast) });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      expect(result.downstream[0]!.endpoints_affected).toEqual(['GET /a']);
    });

    it('excludes changed symbols with zero external callers from downstream — the card shows blast radius only, not every changed function', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const blast: BlastResult = {
        changedSymbols: [
          { file: 'src/foo.ts', name: 'foo', kind: 'function' },
          { file: 'src/unused.ts', name: 'unused', kind: 'function' },
        ],
        callers: [
          { file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'foo', line: 10, rank: 1 },
          // no caller rows reference 'unused' at all — self-file calls are
          // already excluded upstream (repo-intel), so 0 here means "no
          // external callers", not "unresolved".
        ],
        impactedEndpoints: [],
      };
      const container = buildContainer({ repoIntel: stubRepoIntel(blast) });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      // changed_symbols still reports both — it's the total-changed count.
      expect(result.changed_symbols).toHaveLength(2);
      // downstream is blast-radius-only: 'unused' has nothing to show.
      expect(result.downstream).toHaveLength(1);
      expect(result.downstream[0]!.symbol).toBe('foo');
      expect(result.downstream.some((d) => d.symbol === 'unused')).toBe(false);
    });
  });

  describe('get() — degraded path', () => {
    it('attributes the flat impactedEndpoints to every symbol and propagates degraded/reason', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const blast: BlastResult = {
        changedSymbols: [
          { file: 'src/foo.ts', name: 'foo', kind: 'function' },
          { file: 'src/bar.ts', name: 'bar', kind: 'function' },
        ],
        callers: [
          { file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'foo', line: 10, rank: 0 },
          { file: 'src/callerC.ts', symbol: 'callC', viaSymbol: 'bar', line: 5, rank: 0 },
        ],
        impactedEndpoints: ['GET /a', 'POST /b'],
        factsByFile: undefined,
        degraded: true,
        reason: 'no_data',
      };
      const container = buildContainer({ repoIntel: stubRepoIntel(blast) });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      expect(result.degraded).toBe(true);
      expect(result.reason).toBe('no_data');
      for (const impact of result.downstream) {
        expect(impact.endpoints_affected).toEqual(['GET /a', 'POST /b']);
        expect(impact.crons_affected).toEqual([]);
      }
    });
  });

  describe('get() — unknown PR', () => {
    it('throws NotFoundError when the PR does not belong to the workspace', async () => {
      getPullSpy.mockResolvedValue(undefined);
      const container = buildContainer({
        repoIntel: stubRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
      });
      const service = new BlastService(container);

      await expect(service.get('unknown-pr', WORKSPACE_ID)).rejects.toThrow(NotFoundError);
    });
  });

  describe('get() — zero LLM calls', () => {
    it('never calls container.llm for a normal fixture', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const llm = new MockLLMProvider('openai');
      const container = buildContainer({
        repoIntel: stubRepoIntel({
          changedSymbols: [{ file: 'src/foo.ts', name: 'foo', kind: 'function' }],
          callers: [],
          impactedEndpoints: [],
        }),
        llm,
      });
      const service = new BlastService(container);

      await service.get(PR_ID, WORKSPACE_ID);

      expect(container.llm).not.toHaveBeenCalled();
      expect(llm.calls).toHaveLength(0);
    });

    it('never calls container.llm on the degraded path', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const llm = new MockLLMProvider('openai');
      const container = buildContainer({
        repoIntel: stubRepoIntel({
          changedSymbols: [],
          callers: [],
          impactedEndpoints: [],
          degraded: true,
          reason: 'flag_off',
        }),
        llm,
      });
      const service = new BlastService(container);

      await service.get(PR_ID, WORKSPACE_ID);

      expect(container.llm).not.toHaveBeenCalled();
      expect(llm.calls).toHaveLength(0);
    });

    it('never calls container.llm even when a persisted summary exists', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      getBlastSummarySpy.mockResolvedValue({ summary: 'Previously generated.', generatedAt: new Date() });
      const llm = new MockLLMProvider('openai');
      const container = buildContainer({
        repoIntel: stubRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
        llm,
      });
      const service = new BlastService(container);

      const result = await service.get(PR_ID, WORKSPACE_ID);

      expect(result.summary).toBe('Previously generated.');
      expect(container.llm).not.toHaveBeenCalled();
    });
  });

  describe('generateSummary()', () => {
    it('calls container.llm exactly once and persists via upsertBlastSummary', async () => {
      getPullSpy.mockResolvedValue(buildPrRow());
      const llm = new MockLLMProvider('openai', { completionText: 'This change affects two callers.' });
      const container = buildContainer({
        repoIntel: stubRepoIntel({
          changedSymbols: [{ file: 'src/foo.ts', name: 'foo', kind: 'function' }],
          callers: [{ file: 'src/callerA.ts', symbol: 'callA', viaSymbol: 'foo', line: 10, rank: 1 }],
          impactedEndpoints: [],
        }),
        llm,
      });
      const service = new BlastService(container);

      const result = await service.generateSummary(PR_ID, WORKSPACE_ID);

      expect(container.llm).toHaveBeenCalledTimes(1);
      expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);
      expect(upsertBlastSummarySpy).toHaveBeenCalledTimes(1);
      expect(upsertBlastSummarySpy).toHaveBeenCalledWith(PR_ID, 'This change affects two callers.');
      expect(result.summary).toBe('This change affects two callers.');
      expect(result.pr_id).toBe(PR_ID);
    });

    it('throws NotFoundError when the PR does not belong to the workspace, without calling the LLM', async () => {
      getPullSpy.mockResolvedValue(undefined);
      const llm = new MockLLMProvider('openai');
      const container = buildContainer({
        repoIntel: stubRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
        llm,
      });
      const service = new BlastService(container);

      await expect(service.generateSummary('unknown-pr', WORKSPACE_ID)).rejects.toThrow(NotFoundError);
      expect(llm.calls).toHaveLength(0);
    });
  });
});
