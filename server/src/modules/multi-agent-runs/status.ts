/**
 * Multi-agent run status derivation (pure). `multi_agent_runs.status` is only
 * ever written as `'running'` at creation time (T-06) — the EFFECTIVE status
 * shown to a caller is always derived-on-read from the linked `agent_runs`
 * children via this single shared helper, so a run whose results page was
 * never opened never shows a stale `running` (used by both
 * `GET /multi-agent-runs/:id` and `GET /pulls/:id/multi-agent-runs` in T-06).
 */

export type MultiRunStatus = 'running' | 'complete' | 'failed';

export interface ChildRunStatus {
  /** `agent_runs.status` — 'running' | 'done' | 'failed' | 'cancelled' | null. */
  status: string | null;
}

/**
 * Any child still `running` → running. Otherwise, once every child is
 * terminal, `complete` only when EVERY child is `done`; any other terminal
 * mix (failed/cancelled present) → failed.
 */
export function deriveMultiRunStatus(childRuns: ChildRunStatus[]): MultiRunStatus {
  if (childRuns.some((run) => run.status === 'running')) return 'running';
  if (childRuns.every((run) => run.status === 'done')) return 'complete';
  return 'failed';
}
