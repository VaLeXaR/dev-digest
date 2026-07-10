import { describe, it, expect, vi } from 'vitest';
import { buildOnboardingFacts, flattenCriticalPathChains } from './facts.js';
import type { RepoIntel, IndexState, FileRankRow, RepoMapResult } from '../repo-intel/types.js';

const REPO_ID = 'repo-1';

function baseIndexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    repoId: REPO_ID,
    status: 'full',
    filesIndexed: 42,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'abc123',
    indexerVersion: 1,
    updatedAt: new Date(0),
    degraded: false,
    ...overrides,
  };
}

/** Minimal fake satisfying only the RepoIntel methods facts.ts calls. */
function makeRepoIntel(overrides: {
  indexState: IndexState;
  topFiles?: string[];
  fileRanks?: FileRankRow[];
  criticalPathChains?: string[][];
  repoMap?: RepoMapResult;
}): RepoIntel {
  return {
    getIndexState: vi.fn().mockResolvedValue(overrides.indexState),
    getTopFilesByRank: vi.fn().mockResolvedValue(overrides.topFiles ?? []),
    getFileRank: vi.fn().mockResolvedValue(overrides.fileRanks ?? []),
    getCriticalPaths: vi.fn().mockResolvedValue(overrides.criticalPathChains ?? []),
    getRepoMap: vi.fn().mockResolvedValue(
      overrides.repoMap ?? { text: '', tokens: 0, cached: false },
    ),
  } as unknown as RepoIntel;
}

describe('flattenCriticalPathChains', () => {
  it('flattens multiple chains preserving first-seen order and dedups repeats', () => {
    const chains = [
      ['a.ts', 'b.ts', 'c.ts'],
      ['a.ts', 'd.ts'],
      ['e.ts', 'b.ts'],
    ];
    expect(flattenCriticalPathChains(chains)).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'd.ts',
      'e.ts',
    ]);
  });

  it('returns [] for an empty chain list', () => {
    expect(flattenCriticalPathChains([])).toEqual([]);
  });
});

describe('buildOnboardingFacts', () => {
  it('returns index_required with no fact bundle when the index is degraded', async () => {
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState({ degraded: true, filesIndexed: 0 }),
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result).toEqual({ state: 'index_required' });
    expect(repoIntel.getTopFilesByRank).not.toHaveBeenCalled();
    expect(repoIntel.getCriticalPaths).not.toHaveBeenCalled();
    expect(repoIntel.getRepoMap).not.toHaveBeenCalled();
  });

  it('returns index_required when filesIndexed is 0 even if not flagged degraded', async () => {
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState({ degraded: false, filesIndexed: 0 }),
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result).toEqual({ state: 'index_required' });
  });

  it('computes the reading path as the flatten-dedup of getCriticalPaths chains', async () => {
    const chains = [
      ['src/server.ts', 'src/routes.ts'],
      ['src/server.ts', 'src/db.ts'],
    ];
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState(),
      criticalPathChains: chains,
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('unreachable');
    expect(result.facts.readingPath).toEqual(flattenCriticalPathChains(chains));
    expect(result.facts.readingPath).toEqual(['src/server.ts', 'src/routes.ts', 'src/db.ts']);
  });

  it('enriches top-ranked critical-path files with percentile from getFileRank', async () => {
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState(),
      topFiles: ['src/a.ts', 'src/b.ts'],
      fileRanks: [
        { path: 'src/a.ts', percentile: 0.95 },
        { path: 'src/b.ts', percentile: 0.5 },
      ],
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('unreachable');
    expect(result.facts.criticalPathFiles).toEqual([
      { path: 'src/a.ts', rankPercentile: 0.95 },
      { path: 'src/b.ts', rankPercentile: 0.5 },
    ]);
  });

  it('defaults rankPercentile to 0 for a top file missing from getFileRank results', async () => {
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState(),
      topFiles: ['src/a.ts'],
      fileRanks: [],
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('unreachable');
    expect(result.facts.criticalPathFiles).toEqual([{ path: 'src/a.ts', rankPercentile: 0 }]);
  });

  it('carries repo skeleton text and meta from getRepoMap/getIndexState', async () => {
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState({ filesIndexed: 123, lastIndexedSha: 'deadbeef' }),
      repoMap: { text: '# skeleton', tokens: 10, cached: true },
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('unreachable');
    expect(result.facts.repoSkeleton).toBe('# skeleton');
    expect(result.facts.meta).toEqual({ filesIndexed: 123, indexedAtSha: 'deadbeef' });
  });

  it('returns an empty fact bundle (not index_required) when indexed but no ranked/critical-path data exists', async () => {
    const repoIntel = makeRepoIntel({
      indexState: baseIndexState(),
      topFiles: [],
      criticalPathChains: [],
    });

    const result = await buildOnboardingFacts(REPO_ID, repoIntel);

    expect(result).toEqual({
      state: 'ready',
      facts: {
        criticalPathFiles: [],
        readingPath: [],
        repoSkeleton: '',
        meta: { filesIndexed: 42, indexedAtSha: 'abc123' },
      },
    });
  });
});
