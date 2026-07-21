import type {
  MultiAgentEstimateResponse,
  MultiAgentRunCreateResponse,
  MultiAgentRunDetail,
  MultiAgentRunAgent,
  MultiAgentRunListItem,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, PullRow } from '../../db/rows.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Logger } from '../reviews/run-executor.js';
import * as repo from './repository.js';
import type { AgentHistorySample, ComputeEstimateResult } from './estimate.js';
import { computeEstimate } from './estimate.js';
import { groupCrossAgent } from './grouping.js';
import { deriveMultiRunStatus } from './status.js';

/**
 * multi-agent-runs Application service (Onion). Orchestrates the T-04 pure
 * grouping/estimate/status helpers + repository against the container's
 * cross-cutting repos/services — never touches `db/schema`/drizzle directly
 * (that's `repository.ts`'s job) and never imports `src/adapters/**`; pricing
 * comes through `container.priceBook` (the composition root's public pricing
 * accessor), keeping this file `depcruise`-clean under `services-depend-on-ports`.
 */
export class MultiAgentRunsService {
  constructor(private container: Container) {}

  // ===========================================================================
  // Create (R3/AC-4, atomic linking E4)
  // ===========================================================================

  /**
   * Resolves the selected agents, computes the pre-run estimate, inserts the
   * `multi_agent_runs` row (estimate stored at launch), then fans out via the
   * shared `ReviewService.runReview` — which threads `multiRunId` into each
   * spawned `agent_runs` insert (T-05), so there is no post-hoc UPDATE window a
   * concurrent same-PR run could race (E4).
   */
  async createMultiRun(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRunCreateResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const targets = await this.resolveAgents(workspaceId, agentIds);
    const estimate = await this.buildEstimate(pull, targets);

    const multiRunId = await repo.insertMultiRun(this.container.db, {
      workspaceId,
      prId,
      selectedAgentIds: agentIds,
      status: 'running',
      estimatedCostUsd: estimate.summary.estCostUsd,
      estimatedDurationMs: estimate.summary.estDurationMs,
    });

    const { runs } = await this.container.reviewService.runReview(workspaceId, prId, targets, logger, {
      multiRunId,
    });

    return {
      multiRunId,
      runs: runs.map((r) => ({ agentId: r.agent_id, runId: r.run_id })),
    };
  }

  // ===========================================================================
  // Estimate (R5/AC-9..11)
  // ===========================================================================

  async estimate(
    workspaceId: string,
    prId: string,
    agentIds: string[],
  ): Promise<MultiAgentEstimateResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const targets = await this.resolveAgents(workspaceId, agentIds);
    return this.buildEstimate(pull, targets);
  }

  // ===========================================================================
  // Reads (R4/AC-7, AC-8, R6, R7, R12)
  // ===========================================================================

  /** `status` derived-on-read via the shared `status.ts` helper (never a stale 'running'). */
  async getMultiRun(workspaceId: string, id: string): Promise<MultiAgentRunDetail> {
    const multiRun = await repo.getMultiRun(this.container.db, workspaceId, id);
    if (!multiRun) throw new NotFoundError('Multi-agent run not found');

    const linked = await repo.linkedAgentRuns(this.container.db, id);
    const status = deriveMultiRunStatus(linked.map((r) => ({ status: r.status })));

    // Agents whose agent_id was set null (deleted agent) can't carry a
    // findings-verdict or agent-column identity anymore — excluded from both
    // the returned agent list and the cross-agent grouping's ran-agent set,
    // consistent with `findingsForMultiRun`'s own null-agentId filter.
    const ranAgents = linked.filter(
      (r): r is repo.LinkedAgentRunRow & { agentId: string } => r.agentId != null,
    );
    const agents: MultiAgentRunAgent[] = ranAgents.map((r) => ({
      agentId: r.agentId,
      runId: r.runId,
      name: r.name,
      status: r.status ?? 'unknown',
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      score: r.score,
      findingsCount: r.findingsCount,
    }));

    const findings = await repo.findingsForMultiRun(this.container.db, id);
    const groups = groupCrossAgent(
      findings,
      ranAgents.map((r) => r.agentId),
    );

    return {
      id: multiRun.id,
      prId: multiRun.prId,
      status,
      ranAt: multiRun.ranAt,
      agents,
      groups,
    };
  }

  /** Each item's `status` ALSO via `deriveMultiRunStatus` — never a second inline copy (R3/R7). */
  async listMultiRuns(workspaceId: string, prId: string): Promise<MultiAgentRunListItem[]> {
    const rows = await repo.listMultiRuns(this.container.db, workspaceId, prId);
    return this.buildListItems(rows);
  }

  /**
   * Recent runs across a whole repo (newest first) — the `/multi-agent-review`
   * landing source. Same item shape + derived status as the per-PR list.
   */
  async listRunsForRepo(workspaceId: string, repoId: string): Promise<MultiAgentRunListItem[]> {
    const rows = await repo.listMultiRunsForRepo(this.container.db, workspaceId, repoId);
    return this.buildListItems(rows);
  }

  /**
   * Delete a multi-agent run (unlink semantics — the linked `agent_runs` keep
   * their history via the `set null` FK; only the comparison grouping is
   * removed). Workspace-scoped; 404s if the id isn't owned by this workspace.
   */
  async deleteMultiRun(workspaceId: string, id: string): Promise<void> {
    const deleted = await repo.deleteMultiRun(this.container.db, workspaceId, id);
    if (!deleted) throw new NotFoundError('Multi-agent run not found');
  }

  /** Map multi-run rows → list items, deriving status + Σcost/MAXduration per run via the shared helpers. */
  private async buildListItems(rows: repo.MultiRunRow[]): Promise<MultiAgentRunListItem[]> {
    const items: MultiAgentRunListItem[] = [];
    for (const row of rows) {
      const linked = await repo.linkedAgentRuns(this.container.db, row.id);
      const status = deriveMultiRunStatus(linked.map((r) => ({ status: r.status })));
      const totals = this.aggregateTotals(linked);
      items.push({
        id: row.id,
        ranAt: row.ranAt,
        status,
        agentCount: linked.length,
        totalCostUsd: totals.totalCostUsd,
        totalDurationMs: totals.totalDurationMs,
      });
    }
    return items;
  }

  // ===========================================================================
  // Internals
  // ===========================================================================

  private async resolveAgents(workspaceId: string, agentIds: string[]): Promise<AgentRow[]> {
    const targets: AgentRow[] = [];
    for (const agentId of agentIds) {
      const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
      if (!agent) throw new NotFoundError(`Agent not found: ${agentId}`);
      targets.push(agent);
    }
    return targets;
  }

  /** Wires the T-04 repo aggregates + pure `estimate.ts` math together (AC-9..11). */
  private async buildEstimate(pull: PullRow, targets: AgentRow[]): Promise<ComputeEstimateResult> {
    const diffSize = (await repo.pullDiffSize(this.container.db, pull.id)) ?? pull.additions + pull.deletions;
    const tokenRate = await repo.repoTokenRate(this.container.db, pull.repoId);

    const perAgentHistory: Record<string, AgentHistorySample | undefined> = {};
    for (const agent of targets) {
      perAgentHistory[agent.id] = await repo.recentCompletedRunsForAgentOnRepo(
        this.container.db,
        agent.id,
        pull.repoId,
      );
    }

    const modelByAgentId = new Map(targets.map((a) => [a.id, a.model]));
    // `tokenRate` blends tokensIn+tokensOut into ONE ratio (repository.ts's
    // computeTokenRate), so the `estimatedTokens` figure `computeEstimate`
    // hands to `priceFor` is a single combined projection, not split by
    // direction — there is no per-direction history to split it with at this
    // branch (diff-size fallback only fires when the agent has no runs at all
    // on this repo). Priced entirely as `tokensIn`: the diff itself dominates
    // token volume for a review call, and this is a directional pre-run
    // estimate, not a billing computation.
    const priceFor = (agentId: string, estimatedTokens: number): number | null => {
      const model = modelByAgentId.get(agentId);
      if (!model) return null;
      return this.container.priceBook.estimate(model, estimatedTokens, 0);
    };

    return computeEstimate({
      agentIds: targets.map((a) => a.id),
      perAgentHistory,
      diffSize,
      tokenRate,
      priceFor,
    });
  }

  /** Cost = Σ, duration = MAX (parallel fan-out, same convention as the estimate summary AC-10). */
  private aggregateTotals(linked: repo.LinkedAgentRunRow[]): {
    totalCostUsd: number | null;
    totalDurationMs: number | null;
  } {
    const costs = linked.map((r) => r.costUsd);
    const durations = linked.map((r) => r.durationMs);
    const allCostsKnown = linked.length > 0 && costs.every((c) => c != null);
    const allDurationsKnown = linked.length > 0 && durations.every((d) => d != null);
    return {
      totalCostUsd: allCostsKnown ? costs.reduce<number>((sum, c) => sum + (c ?? 0), 0) : null,
      totalDurationMs: allDurationsKnown ? Math.max(...(durations as number[])) : null,
    };
  }
}
