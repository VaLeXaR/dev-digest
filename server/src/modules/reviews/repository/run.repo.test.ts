import { describe, it, expect } from 'vitest';
import type { Db } from '../../../db/client.js';
import { createAgentRun } from './run.repo.js';

/**
 * Hermetic test for T-05 (multi-agent-review.md) — no Docker/DB needed.
 * Fakes the minimal `db.insert(table).values(v).returning(sel)` chain
 * `createAgentRun` actually calls and captures the `values` payload, so this
 * asserts the exact column written without a real Postgres round-trip.
 */
function fakeDb(capture: { values?: Record<string, unknown> }): Db {
  return {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        capture.values = v;
        return { returning: async () => [{ id: 'run-1' }] };
      },
    }),
  } as unknown as Db;
}

const baseValues = {
  workspaceId: 'ws-1',
  agentId: 'agent-1',
  prId: 'pr-1',
  provider: 'openai',
  model: 'gpt-5',
};

describe('createAgentRun — multi_agent_run_id linking (T-05)', () => {
  it('sets multi_agent_run_id when multiRunId is passed', async () => {
    const capture: { values?: Record<string, unknown> } = {};
    const runId = await createAgentRun(fakeDb(capture), { ...baseValues, multiRunId: 'multi-run-1' });

    expect(runId).toBe('run-1');
    expect(capture.values?.multiAgentRunId).toBe('multi-run-1');
  });

  it('leaves multi_agent_run_id null when multiRunId is absent (solo runs unaffected)', async () => {
    const capture: { values?: Record<string, unknown> } = {};
    const runId = await createAgentRun(fakeDb(capture), { ...baseValues });

    expect(runId).toBe('run-1');
    expect(capture.values?.multiAgentRunId).toBeNull();
  });
});
