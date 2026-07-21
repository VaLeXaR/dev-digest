import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * Multi-Agent Review contracts (T-01, SPEC-2026-07-19-multi-agent-review).
 * A multi-agent run fans out N agents over one PR concurrently, persists one
 * `multi_agent_runs` row linking each spawned `agent_runs` row, and surfaces
 * per-agent results plus a cross-agent "where agents disagree" grouping.
 *
 * Estimate cost/duration fields are `.nullable()` throughout: at an absolute
 * cold start (no completed run anywhere to derive a token-rate from) the
 * server returns `null` rather than a hardcoded guess, and the UI renders `—`.
 */

/** Request body of `POST /pulls/:id/multi-agent-runs`. */
export const MultiAgentRunCreateRequest = z.object({
  agentIds: z.string().uuid().array().min(1),
});
export type MultiAgentRunCreateRequest = z.infer<typeof MultiAgentRunCreateRequest>;

/** Response of `POST /pulls/:id/multi-agent-runs`. */
export const MultiAgentRunCreateResponse = z.object({
  multiRunId: z.string(),
  runs: z.array(
    z.object({
      agentId: z.string(),
      runId: z.string(),
    }),
  ),
});
export type MultiAgentRunCreateResponse = z.infer<typeof MultiAgentRunCreateResponse>;

/** One agent's verdict within a cross-agent group — binary flagged/did-not-flag only (AC-15). */
export const CrossAgentVerdict = z.object({
  agentId: z.string(),
  state: z.enum(['flagged', 'did_not_flag']),
  severity: Severity.nullish(),
  findingId: z.string().nullish(),
});
export type CrossAgentVerdict = z.infer<typeof CrossAgentVerdict>;

/**
 * A cross-agent "where agents disagree" group — findings from different
 * agents that overlap on the same file + line range, merged into one row
 * with a verdict per agent that ran. `isConflict` is true only when at least
 * one agent flagged and at least one agent that ran did not (AC-16/E10).
 */
export const CrossAgentGroup = z.object({
  file: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  title: z.string(),
  verdicts: z.array(CrossAgentVerdict),
  isConflict: z.boolean(),
});
export type CrossAgentGroup = z.infer<typeof CrossAgentGroup>;

/** One agent's row in a multi-agent run's detail view. */
export const MultiAgentRunAgent = z.object({
  agentId: z.string(),
  runId: z.string(),
  name: z.string(),
  status: z.string(),
  costUsd: z.number().nullable(),
  durationMs: z.number().int().nullable(),
  score: z.number().int().nullable(),
  findingsCount: z.number().int().nullable(),
});
export type MultiAgentRunAgent = z.infer<typeof MultiAgentRunAgent>;

/** Response of `GET /multi-agent-runs/:id`. `status` is derived-on-read from child agent_runs. */
export const MultiAgentRunDetail = z.object({
  id: z.string(),
  prId: z.string(),
  status: z.enum(['running', 'complete', 'failed']),
  ranAt: z.string(),
  agents: z.array(MultiAgentRunAgent),
  groups: z.array(CrossAgentGroup),
});
export type MultiAgentRunDetail = z.infer<typeof MultiAgentRunDetail>;

/** Request body of `POST /pulls/:id/multi-agent-runs/estimate`. */
export const MultiAgentEstimateRequest = z.object({
  agentIds: z.string().uuid().array().min(1),
});
export type MultiAgentEstimateRequest = z.infer<typeof MultiAgentEstimateRequest>;

/** Response of `POST /pulls/:id/multi-agent-runs/estimate`. */
export const MultiAgentEstimateResponse = z.object({
  perAgent: z.array(
    z.object({
      agentId: z.string(),
      estCostUsd: z.number().nullable(),
      estDurationMs: z.number().int().nullable(),
      basis: z.enum(['history', 'diff-size']),
    }),
  ),
  summary: z.object({
    estCostUsd: z.number().nullable(),
    estDurationMs: z.number().int().nullable(),
  }),
});
export type MultiAgentEstimateResponse = z.infer<typeof MultiAgentEstimateResponse>;

/** One row of `GET /pulls/:id/multi-agent-runs` — history list. `status` is derived-on-read. */
export const MultiAgentRunListItem = z.object({
  id: z.string(),
  ranAt: z.string(),
  status: z.enum(['running', 'complete', 'failed']),
  agentCount: z.number().int(),
  totalCostUsd: z.number().nullable(),
  totalDurationMs: z.number().int().nullable(),
});
export type MultiAgentRunListItem = z.infer<typeof MultiAgentRunListItem>;
