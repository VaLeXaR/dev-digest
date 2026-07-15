import type {
  OnboardingGetResponse,
  OnboardingGenerateResponse,
  OnboardingTour,
} from '@devdigest/shared';
import { OnboardingLlmOutput } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import { OnboardingRepository } from './repository.js';
import { buildOnboardingFacts, type OnboardingFactBundle } from './facts.js';
import { buildOnboardingPrompt } from './prompt.js';

/**
 * Onion placement: Application layer. Owns the deterministic-facts →
 * single-`completeStructured`-call → merge → persist pipeline (R1/R4/R6/R7/
 * R8/R9/R10/R19/R23/R25). Constructs its own `new ReviewRepository(container.db)`
 * for repo-metadata/existence lookup and `new OnboardingRepository(container.db)`
 * for tour read/write — mirroring `RisksService`
 * (`server/src/modules/risks/service.ts:8-13`); there is no DI seam for either
 * repository, so hermetic tests patch the prototypes instead
 * (server INSIGHTS 2026-07-02).
 *
 * `container.repoIntel` is typed against the `RepoIntel` port interface, and
 * `buildOnboardingFacts` (T-03) depends on that same interface — no cast
 * needed, per the onion convention of depending on ports, not concrete
 * adapters (`server/src/modules/conventions/extractor.ts:62`).
 */
export class OnboardingService {
  private readonly reviewRepo: ReviewRepository;
  private readonly onboardingRepo: OnboardingRepository;

  constructor(private readonly container: Container) {
    this.reviewRepo = new ReviewRepository(container.db);
    this.onboardingRepo = new OnboardingRepository(container.db);
  }

  /** No LLM call (R10/AC-12) — reads the cached tour + a LIVE currentIndexedSha. */
  async get(repoId: string, workspaceId: string): Promise<OnboardingGetResponse> {
    await this.resolveRepo(repoId, workspaceId);

    const indexState = await this.container.repoIntel.getIndexState(repoId);
    if (!isIndexed(indexState)) {
      return { state: 'index_required' };
    }

    const tour = await this.onboardingRepo.getTour(repoId);
    if (!tour) {
      return { state: 'not_generated' };
    }

    return { state: 'ready', tour, currentIndexedSha: indexState.lastIndexedSha };
  }

  /**
   * Exactly ONE `completeStructured` call per generation (R1/R25/AC-31). If
   * the repo isn't indexed, returns `index_required` with ZERO LLM calls
   * (R9/AC-11) — the facts-bundle short-circuit happens before any model is
   * resolved. On schema-mismatch after retries, `completeStructured` throws;
   * this is caught ONLY to emit the structured failure log line (R25/AC-31 —
   * one log line on success OR failure) before RE-THROWING the original
   * error unchanged, so nothing is persisted and any prior cached row is
   * left unchanged (R6/AC-7/AC-8).
   */
  async generate(repoId: string, workspaceId: string): Promise<OnboardingGenerateResponse> {
    const repoRow = await this.resolveRepo(repoId, workspaceId);

    const factsResult = await buildOnboardingFacts(repoId, this.container.repoIntel);
    if (factsResult.state === 'index_required') {
      return { state: 'index_required' };
    }
    const { facts } = factsResult;

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    const llm = await this.container.llm(provider);
    const messages = buildOnboardingPrompt(repoRow.fullName, facts);

    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: OnboardingLlmOutput,
        schemaName: 'OnboardingLlmOutput',
        messages,
      });
    } catch (err) {
      console.log(
        [
          '[onboarding:generate]',
          'repoId=' + repoId,
          'provider=' + provider,
          'model=' + model,
          'outcome=failure',
          'tokensIn=null',
          'tokensOut=null',
          'costUsd=null',
          'error=' + (err instanceof Error ? err.message : String(err)),
        ].join(' '),
      );
      throw err;
    }

    const tour = mergeOnboardingTour(facts, result.data);
    await this.onboardingRepo.upsertTour(repoId, tour);

    console.log(
      [
        '[onboarding:generate]',
        'repoId=' + repoId,
        'provider=' + provider,
        'model=' + model,
        'outcome=success',
        'tokensIn=' + String(result.tokensIn),
        'tokensOut=' + String(result.tokensOut),
        'costUsd=' + String(result.costUsd),
      ].join(' '),
    );

    return { state: 'ready', tour, currentIndexedSha: facts.meta.indexedAtSha };
  }

  /** Repo-metadata/existence lookup, workspace-scoped. Throws 404 for a repo
   *  that doesn't exist or doesn't belong to this workspace. */
  private async resolveRepo(repoId: string, workspaceId: string) {
    const repoRow = await this.reviewRepo.getRepo(repoId);
    if (!repoRow || repoRow.workspaceId !== workspaceId) {
      throw new NotFoundError('Repository not found');
    }
    return repoRow;
  }
}

function isIndexed(indexState: { degraded?: boolean; filesIndexed: number }): boolean {
  return !indexState.degraded && indexState.filesIndexed > 0;
}

/** The prompt forbids ``` fences in the `diagram` field, but the model
 *  doesn't always comply — strip a wrapping ```mermaid fence before persisting
 *  so stored tours always hold raw Mermaid syntax (client renders it as-is). */
function stripMermaidFence(diagram: string): string {
  const trimmed = diagram.trim();
  const match = /^```(?:mermaid)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  return match ? (match[1] ?? '').trim() : trimmed;
}

/**
 * Merges the LLM's annotations onto the deterministic, server-ordered lists
 * — the ordered lists stay authoritative; any LLM-returned path not present
 * in `facts` is silently dropped by construction, since the output is built
 * by iterating `facts`, never the LLM's own arrays (R4/AC-5).
 */
function mergeOnboardingTour(
  facts: OnboardingFactBundle,
  llm: OnboardingLlmOutput,
): OnboardingTour {
  const whyByPath = new Map(llm.criticalPaths.map((c) => [c.path, c.why]));
  const criticalPaths = facts.criticalPathFiles.map((f) => ({
    path: f.path,
    rankPercentile: f.rankPercentile,
    fanIn: f.fanIn,
    why: whyByPath.get(f.path) ?? '',
  }));

  const reasonByPath = new Map(llm.readingPath.map((r) => [r.path, r.reason]));
  const readingPath = facts.readingPath.map((path) => ({
    path,
    reason: reasonByPath.get(path) ?? '',
  }));

  return {
    architecture: {
      summary: llm.architecture.summary,
      diagram: stripMermaidFence(llm.architecture.diagram),
    },
    criticalPaths,
    runLocally: { aiGenerated: true, commands: llm.runLocally.commands },
    readingPath,
    firstTasks: llm.firstTasks,
    meta: {
      filesIndexed: facts.meta.filesIndexed,
      generatedAt: new Date().toISOString(),
      indexedAtSha: facts.meta.indexedAtSha,
    },
  };
}
