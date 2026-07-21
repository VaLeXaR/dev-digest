import { describe, it, expect } from 'vitest';
import { computeEstimate } from './estimate.js';

describe('computeEstimate', () => {
  it('uses the history basis when the agent has repo-scoped history', () => {
    const result = computeEstimate({
      agentIds: ['agent-a'],
      perAgentHistory: { 'agent-a': { avgCostUsd: 0.05, avgDurationMs: 4000 } },
      diffSize: 100,
      tokenRate: { tokensPerDiffLine: 20, msPerDiffLine: 50 },
      priceFor: () => 999, // must be ignored — history wins
    });
    expect(result.perAgent[0]).toEqual({
      agentId: 'agent-a',
      estCostUsd: 0.05,
      estDurationMs: 4000,
      basis: 'history',
    });
  });

  it('rounds a fractional history avgDurationMs to an int (estimated_duration_ms is an integer column)', () => {
    const result = computeEstimate({
      agentIds: ['agent-a'],
      // A real repo-scoped average is fractional; the stored/contract value must be an int.
      perAgentHistory: { 'agent-a': { avgCostUsd: 0.0005, avgDurationMs: 122440.5 } },
      diffSize: 100,
      tokenRate: { tokensPerDiffLine: 20, msPerDiffLine: 50 },
      priceFor: () => 0,
    });
    expect(result.perAgent[0]!.estDurationMs).toBe(122441);
    expect(Number.isInteger(result.summary.estDurationMs)).toBe(true);
  });

  it('falls back to the diff-size basis when the agent has no history but a token rate exists', () => {
    const result = computeEstimate({
      agentIds: ['agent-a'],
      perAgentHistory: {},
      diffSize: 100,
      tokenRate: { tokensPerDiffLine: 20, msPerDiffLine: 50 },
      priceFor: (agentId, estimatedTokens) => estimatedTokens * 0.001,
    });
    expect(result.perAgent[0]!.basis).toBe('diff-size');
    expect(result.perAgent[0]!.estDurationMs).toBe(5000); // 100 * 50
    expect(result.perAgent[0]!.estCostUsd).toBe(2); // 100*20 tokens * 0.001
  });

  it('summary cost is the sum and duration is the max across agents', () => {
    const result = computeEstimate({
      agentIds: ['agent-a', 'agent-b'],
      perAgentHistory: {
        'agent-a': { avgCostUsd: 0.05, avgDurationMs: 4000 },
        'agent-b': { avgCostUsd: 0.1, avgDurationMs: 9000 },
      },
      diffSize: 100,
      tokenRate: { tokensPerDiffLine: 20, msPerDiffLine: 50 },
      priceFor: () => 0,
    });
    expect(result.summary.estCostUsd).toBeCloseTo(0.15);
    expect(result.summary.estDurationMs).toBe(9000);
  });

  it('at absolute cold start (no token rate, no history) both cost and duration are null with no hardcoded fallback', () => {
    const result = computeEstimate({
      agentIds: ['agent-a', 'agent-b'],
      perAgentHistory: {},
      diffSize: 100,
      tokenRate: null,
      priceFor: () => {
        throw new Error('priceFor must not be called when tokenRate is null');
      },
    });
    expect(result.perAgent).toEqual([
      { agentId: 'agent-a', estCostUsd: null, estDurationMs: null, basis: 'diff-size' },
      { agentId: 'agent-b', estCostUsd: null, estDurationMs: null, basis: 'diff-size' },
    ]);
    expect(result.summary).toEqual({ estCostUsd: null, estDurationMs: null });
  });

  it('summary is null when only some per-agent estimates are known (partial data is not a real total)', () => {
    const result = computeEstimate({
      agentIds: ['agent-a', 'agent-b'],
      perAgentHistory: { 'agent-a': { avgCostUsd: 0.05, avgDurationMs: 4000 } },
      diffSize: 100,
      tokenRate: null, // agent-b has no history and no rate -> null
      priceFor: () => 0,
    });
    expect(result.perAgent[1]).toEqual({
      agentId: 'agent-b',
      estCostUsd: null,
      estDurationMs: null,
      basis: 'diff-size',
    });
    expect(result.summary).toEqual({ estCostUsd: null, estDurationMs: null });
  });
});
