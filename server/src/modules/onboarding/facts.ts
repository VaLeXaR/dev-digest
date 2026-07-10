import type { RepoIntel } from '../repo-intel/types.js';

/**
 * Deterministic fact composition for the Onboarding Tour (R2/R3/R5/R9). Every
 * value here is computed from `RepoIntel` reads only — ZERO LLM calls.
 * `service.ts` (T-04) builds the prompt from this bundle, makes the single
 * `completeStructured` call, and merges the LLM's annotations back onto these
 * server-computed, authoritative lists (never re-sorted by the LLM).
 *
 * Typed against the `RepoIntel` port interface, not the concrete
 * `RepoIntelService` — `getTopFilesByRank` / `getCriticalPaths` are already
 * declared on the interface itself (`server/src/modules/repo-intel/types.ts:166-171`),
 * so depending on the interface here follows the established onion convention
 * (`server/src/modules/conventions/extractor.ts:62`).
 */

/** How many top-ranked files feed the critical-paths section (R2/AC-3). */
export const CRITICAL_PATH_FILE_COUNT = 10;

export interface OnboardingCriticalPathFact {
  path: string;
  rankPercentile: number;
  /**
   * Import-graph fan-in count for this file. NOT computed here: aggregating
   * `file_edges` by `toFile` requires `RepoIntelRepository.getEdges`, which is
   * a PRIVATE field on `RepoIntelService` (`this.repo`) with no public
   * wrapper anywhere on the `RepoIntelService`/`RepoIntel` surface — see
   * `server/INSIGHTS.md` (2026-07-10) for the full trace. `fanIn` is optional
   * on the persisted `OnboardingCriticalPath` contract precisely so this can
   * be safely omitted; left `undefined` here rather than guessed at.
   */
  fanIn?: number;
}

export interface OnboardingFactsMeta {
  filesIndexed: number;
  indexedAtSha: string;
}

export interface OnboardingFactBundle {
  /** Top-N critical-path files, rank DESC, junk-excluded (R2/AC-3). */
  criticalPathFiles: OnboardingCriticalPathFact[];
  /** Guided-reading-path file order — flatten-dedup of `getCriticalPaths` chains (R3/AC-4). */
  readingPath: string[];
  /** Repo skeleton text (`getRepoMap(repoId).text`); '' when degraded. */
  repoSkeleton: string;
  meta: OnboardingFactsMeta;
}

export type OnboardingFactsResult =
  | { state: 'index_required' }
  | { state: 'ready'; facts: OnboardingFactBundle };

/**
 * Flattens `getCriticalPaths`' `string[][]` dependency chains into one
 * ordered, deduped file-path list (first occurrence wins) — the guided
 * reading-path order (R3/AC-4). Pure; exported for direct unit testing.
 */
export function flattenCriticalPathChains(chains: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chain of chains) {
    for (const path of chain) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Compute the deterministic fact bundle for a repo — ZERO LLM calls.
 *
 * Index gate (R9/AC-11): `getIndexState` always resolves (never throws), even
 * for an unindexed repo, where it synthesizes a degraded row
 * (`degraded:true, filesIndexed:0`). "Indexed" = `!degraded && filesIndexed > 0`;
 * anything else short-circuits to `{ state: 'index_required' }` with no
 * further repo-intel reads and no fact bundle.
 */
export async function buildOnboardingFacts(
  repoId: string,
  repoIntel: RepoIntel,
): Promise<OnboardingFactsResult> {
  const indexState = await repoIntel.getIndexState(repoId);
  const indexed = !indexState.degraded && indexState.filesIndexed > 0;
  if (!indexed) {
    return { state: 'index_required' };
  }

  const topPaths = await repoIntel.getTopFilesByRank(repoId, CRITICAL_PATH_FILE_COUNT);
  const rankRows = topPaths.length > 0 ? await repoIntel.getFileRank(repoId, topPaths) : [];
  const percentileByPath = new Map(rankRows.map((r) => [r.path, r.percentile]));
  const criticalPathFiles: OnboardingCriticalPathFact[] = topPaths.map((path) => ({
    path,
    rankPercentile: percentileByPath.get(path) ?? 0,
  }));

  const chains = await repoIntel.getCriticalPaths(repoId);
  const readingPath = flattenCriticalPathChains(chains);

  const repoMap = await repoIntel.getRepoMap(repoId);

  return {
    state: 'ready',
    facts: {
      criticalPathFiles,
      readingPath,
      repoSkeleton: repoMap.text,
      meta: {
        filesIndexed: indexState.filesIndexed,
        indexedAtSha: indexState.lastIndexedSha,
      },
    },
  };
}
