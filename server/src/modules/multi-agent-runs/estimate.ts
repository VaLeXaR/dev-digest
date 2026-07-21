/**
 * Pre-run cost/duration estimate (pure, R5/AC-9..11). Per agent: prefer the
 * agent's own repo-scoped completed-run HISTORY average; fall back to a
 * diff-size × data-derived-rate projection when the agent has no history on
 * this repo. `priceFor` is INJECTED (not imported) so this file never reaches
 * into `src/adapters/**` (keeps it off the onion boundary / depcruise-clean).
 *
 * Absolute cold start (`tokenRate === null` AND the agent has no history):
 * both `estCostUsd` and `estDurationMs` are `null` for that agent — NEVER a
 * hardcoded constant. The UI renders `—`.
 */

export type EstimateBasis = 'history' | 'diff-size';

/** One agent's repo-scoped completed-run average, when it has ≥1 sample. */
export interface AgentHistorySample {
  avgCostUsd: number | null;
  avgDurationMs: number | null;
}

/**
 * Data-derived fallback rate (repo-scoped, else workspace-global — resolved
 * by the caller/repository before this function is called). `null` means no
 * completed run exists anywhere to derive a rate from (absolute cold start).
 */
export interface DiffSizeRate {
  tokensPerDiffLine: number;
  msPerDiffLine: number;
}

export interface PerAgentEstimate {
  agentId: string;
  estCostUsd: number | null;
  estDurationMs: number | null;
  basis: EstimateBasis;
}

export interface EstimateSummary {
  /** Σ per-agent estCostUsd; null unless every per-agent estimate is known. */
  estCostUsd: number | null;
  /** MAX per-agent estDurationMs (parallel fan-out, AC-10); null unless every per-agent estimate is known. */
  estDurationMs: number | null;
}

export interface ComputeEstimateResult {
  perAgent: PerAgentEstimate[];
  summary: EstimateSummary;
}

export interface ComputeEstimateInput {
  agentIds: string[];
  /** Keyed by agentId; absent/undefined entry means "no history for this agent on this repo" → diff-size basis. */
  perAgentHistory: Record<string, AgentHistorySample | undefined>;
  /** PR diff size (additions + deletions). */
  diffSize: number;
  /** Repo-scoped rate, else workspace-global, else null at absolute cold start. */
  tokenRate: DiffSizeRate | null;
  /** Given an agent id and an estimated total token count, returns the projected cost (or null if the model's price is unknown). */
  priceFor: (agentId: string, estimatedTokens: number) => number | null;
}

export function computeEstimate(input: ComputeEstimateInput): ComputeEstimateResult {
  const { agentIds, perAgentHistory, diffSize, tokenRate, priceFor } = input;

  const perAgent: PerAgentEstimate[] = agentIds.map((agentId) => {
    const history = perAgentHistory[agentId];
    if (history) {
      return {
        agentId,
        estCostUsd: history.avgCostUsd,
        // Round: avgDurationMs is a fractional average, but estDurationMs is an
        // int per the contract AND is stored in the `estimated_duration_ms`
        // integer column at launch — a float there is a Postgres insert error.
        estDurationMs: history.avgDurationMs == null ? null : Math.round(history.avgDurationMs),
        basis: 'history',
      };
    }

    if (!tokenRate) {
      return { agentId, estCostUsd: null, estDurationMs: null, basis: 'diff-size' };
    }

    const estimatedTokens = diffSize * tokenRate.tokensPerDiffLine;
    return {
      agentId,
      estCostUsd: priceFor(agentId, estimatedTokens),
      estDurationMs: Math.round(diffSize * tokenRate.msPerDiffLine),
      basis: 'diff-size',
    };
  });

  const costs = perAgent.map((a) => a.estCostUsd);
  const durations = perAgent.map((a) => a.estDurationMs);
  const allCostsKnown = perAgent.length > 0 && costs.every((c) => c != null);
  const allDurationsKnown = perAgent.length > 0 && durations.every((d) => d != null);

  const summary: EstimateSummary = {
    estCostUsd: allCostsKnown ? costs.reduce<number>((sum, c) => sum + (c ?? 0), 0) : null,
    estDurationMs: allDurationsKnown ? Math.max(...(durations as number[])) : null,
  };

  return { perAgent, summary };
}
