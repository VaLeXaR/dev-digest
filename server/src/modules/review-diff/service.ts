import type { Container } from '../../platform/container.js';
import type { LLMProvider, Provider, Review, ReviewStrategy } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';

/**
 * review-diff module — a new, synchronous entry point into the SAME review
 * engine (`reviewPullRequest`) the PR-page flow uses. There is no PR here:
 * no repo-intel enrichment, no intent, and NO persistence (no
 * `agent_runs`/`reviews`/`findings` rows, no `runBus`/SSE) — this is an
 * ad-hoc review of a raw working-copy diff string.
 */

const WORKING_TASK = [
  'Review the following local working-copy changes (uncommitted, not yet pushed).',
  'Report only distinct, high-value findings you can defend, each citing an exact',
  'file and line that appears in the diff. Zero findings is a valid result.',
].join(' ');

/**
 * Pure diff → grounded Review path. Parses the raw diff and delegates to the
 * shared review engine; the only side effect is the injected `LLMProvider`.
 * Rejects with `ValidationError` when the diff has no recognizable file
 * changes (empty/malformed input) so the route can 422 before spending an
 * LLM call.
 */
export async function reviewWorkingDiff(input: {
  systemPrompt: string;
  model: string;
  rawDiff: string;
  llm: LLMProvider;
  strategy?: ReviewStrategy;
  skills?: string[];
}): Promise<Review> {
  const diff = parseUnifiedDiff(input.rawDiff);
  if (diff.files.length === 0) {
    throw new ValidationError('Diff contained no recognizable file changes');
  }

  const outcome = await reviewPullRequest({
    systemPrompt: input.systemPrompt,
    model: input.model,
    diff,
    llm: input.llm,
    task: WORKING_TASK,
    ...(input.skills?.length ? { skills: input.skills } : {}),
    ...(input.strategy ? { strategy: input.strategy } : {}),
  });

  return outcome.review;
}

/**
 * Resolves the agent + LLM provider + linked skills (mirroring
 * `ReviewRunExecutor.runOneAgent`'s skill-loading pattern) then runs the pure
 * diff→Review path. All DB access goes through `container.agentsRepo` — never
 * a raw Drizzle query (onion invariant; server/INSIGHTS.md 2026-06-26).
 */
export class ReviewDiffService {
  constructor(private readonly container: Container) {}

  async reviewDiff(workspaceId: string, diff: string, agentId?: string): Promise<Review> {
    const agent = agentId
      ? await this.container.agentsRepo.getById(workspaceId, agentId)
      : (await this.container.agentsRepo.listEnabled(workspaceId))[0];

    if (agentId && !agent) throw new NotFoundError('Agent not found');
    if (!agent) {
      throw new AppError(
        'no_enabled_agent',
        'No enabled review agent found. Enable an agent in the DevDigest UI first.',
        400,
      );
    }

    // container.llm throws ConfigError when the provider key is missing — let
    // it bubble; the app error handler turns it into a 500 config_error the
    // CLI/caller can print verbatim.
    const llm = await this.container.llm(agent.provider as Provider);

    const links = await this.container.agentsRepo.linkedSkills(agent.id);
    const skills = links
      .filter((l) => l.enabled && l.skill.enabled)
      .map((l) => `### ${l.skill.name}\n${l.skill.body}`);

    return reviewWorkingDiff({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      rawDiff: diff,
      llm,
      strategy: agent.strategy ?? undefined,
      skills,
    });
  }
}
