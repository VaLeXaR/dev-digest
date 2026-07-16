import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type Db } from '../../../db/client.js';
import { runMigrations } from '../../../db/migrate.js';
import * as t from '../../../db/schema.js';
import { listCasesForOwner, listCasesForAgent, createCase } from './case.repo.js';
import type { EvalCaseInput } from '@devdigest/shared';

/**
 * DB-backed test for `case.repo.ts`'s owner-generic reads (T-03 of
 * skills-evals-extension.md). Deliberately does NOT touch `eval_run_batches`
 * (still mid-rename under T-01) — this file only exercises `eval_cases`.
 */

let stop: () => Promise<void>;
let db: Db;
const WS_ID = '00000000-0000-0000-0000-000000000101';

beforeAll(async () => {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url);
  db = handle.db;
  stop = handle.close;
  await db.insert(t.workspaces).values({ id: WS_ID, name: 'test-workspace' }).onConflictDoNothing();
}, 60_000);

afterAll(() => stop());

async function makeAgent(workspaceId: string) {
  const [row] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name: `case-repo-test-agent-${Math.random()}`,
      provider: 'openrouter',
      model: 'test-model',
      systemPrompt: 'be helpful',
    })
    .returning();
  return row!;
}

async function makeSkill(workspaceId: string) {
  const [row] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name: `case-repo-test-skill-${Math.random()}`,
      description: 'desc',
      type: 'rubric',
      source: 'manual',
      body: 'be a good reviewer',
    })
    .returning();
  return row!;
}

const expectedOutput: EvalCaseInput['expected_output'] = [
  { type: 'must_find', file: 'src/foo.ts', start_line: 1, end_line: 5, severity: 'WARNING' },
];

function caseInput(overrides: Partial<EvalCaseInput> = {}): EvalCaseInput {
  return {
    owner_kind: 'agent',
    owner_id: overrides.owner_id ?? '',
    name: 'a case',
    input_diff: 'diff --git a/src/foo.ts b/src/foo.ts\n',
    expected_output: expectedOutput,
    ...overrides,
  };
}

describe('case.repo — listCasesForOwner', () => {
  it('returns only owner_kind=skill rows for the given skill owner, excluding an agent case with the same owner_id', async () => {
    const skill = await makeSkill(WS_ID);
    const agent = await makeAgent(WS_ID);

    await createCase(db, WS_ID, caseInput({ owner_kind: 'skill', owner_id: skill.id, name: 'skill-case' }));
    // Same owner_id space, different owner_kind — must never leak in.
    await createCase(db, WS_ID, caseInput({ owner_kind: 'agent', owner_id: skill.id, name: 'same-id-agent-case' }));
    await createCase(db, WS_ID, caseInput({ owner_kind: 'agent', owner_id: agent.id, name: 'unrelated-agent-case' }));

    const cases = await listCasesForOwner(db, WS_ID, 'skill', skill.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.name).toBe('skill-case');
    expect(cases[0]?.owner_kind).toBe('skill');
    expect(cases[0]?.owner_id).toBe(skill.id);
  });

  it('returns only owner_kind=agent rows for the given agent owner', async () => {
    const agent = await makeAgent(WS_ID);
    const other = await makeAgent(WS_ID);

    await createCase(db, WS_ID, caseInput({ owner_id: agent.id, name: 'case-a' }));
    await createCase(db, WS_ID, caseInput({ owner_id: other.id, name: 'case-b' }));

    const cases = await listCasesForOwner(db, WS_ID, 'agent', agent.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.name).toBe('case-a');
  });

  it('listCasesForAgent delegates to listCasesForOwner with owner_kind=agent', async () => {
    const agent = await makeAgent(WS_ID);
    await createCase(db, WS_ID, caseInput({ owner_id: agent.id, name: 'via-delegate' }));

    const viaAgent = await listCasesForAgent(db, WS_ID, agent.id);
    const viaOwner = await listCasesForOwner(db, WS_ID, 'agent', agent.id);
    expect(viaAgent.map((c) => c.id)).toEqual(viaOwner.map((c) => c.id));
  });
});
