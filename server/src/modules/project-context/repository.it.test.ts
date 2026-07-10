import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type Db } from '../../db/client.js';
import { runMigrations } from '../../db/migrate.js';
import * as t from '../../db/schema.js';
import { AgentsRepository } from '../agents/repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { ProjectContextRepository } from './repository.js';

/**
 * DB-backed test for `ProjectContextRepository.usageCounts` — the D-UBA
 * union aggregate (direct `agent_context_docs` attach ∪ inherited
 * `skill_context_docs` attach via an enabled `agent_skills` link to an
 * enabled skill) that only a real Postgres join can exercise. Mirrors
 * `agents/repository.it.test.ts` / `skills/repository.it.test.ts`.
 */

let stop: () => Promise<void>;
let db: Db;
let agentsRepo: AgentsRepository;
let skillsRepo: SkillsRepository;
let repo: ProjectContextRepository;
const WS_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url);
  db = handle.db;
  stop = handle.close;
  await db.insert(t.workspaces).values({ id: WS_ID, name: 'test-workspace' }).onConflictDoNothing();
  agentsRepo = new AgentsRepository(db);
  skillsRepo = new SkillsRepository(db);
  repo = new ProjectContextRepository(db);
}, 60_000);

afterAll(() => stop());

function makeAgent(name: string, enabled = true) {
  return agentsRepo.insert({
    workspaceId: WS_ID,
    name,
    provider: 'openrouter',
    model: 'test-model',
    systemPrompt: 'be helpful',
    enabled,
  });
}

async function makeSkill(name: string, enabled = true) {
  const skill = await skillsRepo.insert({
    workspaceId: WS_ID,
    name,
    description: '',
    type: 'custom',
    source: 'manual',
    body: 'x',
  });
  if (!enabled) {
    await skillsRepo.update(WS_ID, skill.id, { enabled: false });
    return { ...skill, enabled: false };
  }
  return skill;
}

describe('ProjectContextRepository.usageCounts', () => {
  it('an unattached path returns no entry (used_by_agents defaults to 0 downstream)', async () => {
    const map = await repo.usageCounts(WS_ID, ['unattached.md']);
    expect(map.get('unattached.md')).toBeUndefined();
  });

  it('a doc attached directly to 2 agents counts both (A side of the union)', async () => {
    const path = 'specs/direct-two.md';
    const a1 = await makeAgent('direct-a1');
    const a2 = await makeAgent('direct-a2');
    await agentsRepo.setContextDocs(a1.id, [path]);
    await agentsRepo.setContextDocs(a2.id, [path]);

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount).toBe(2);
    expect(map.get(path)?.coveredByAny).toBe(true);
  });

  it('a doc attached only to a skill linked (enabled link, enabled skill) to 1 agent counts 1 (B side of the union)', async () => {
    const path = 'specs/inherited-one.md';
    const agent = await makeAgent('inherited-agent');
    const skill = await makeSkill('inherited-skill');
    await skillsRepo.setContextDocs(skill.id, [path]);
    await agentsRepo.linkSkill(agent.id, skill.id, 0);

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount).toBe(1);
    expect(map.get(path)?.coveredByAny).toBe(true);
  });

  it('a doc attached both directly AND via an inherited skill to the same agent is counted once (union, not sum)', async () => {
    const path = 'specs/union-same-agent.md';
    const agent = await makeAgent('union-agent');
    const skill = await makeSkill('union-skill');
    await agentsRepo.setContextDocs(agent.id, [path]);
    await skillsRepo.setContextDocs(skill.id, [path]);
    await agentsRepo.linkSkill(agent.id, skill.id, 0);

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount).toBe(1);
  });

  it('a doc attached directly to one agent AND inherited by a different agent counts the union size (2)', async () => {
    const path = 'specs/union-different-agents.md';
    const directAgent = await makeAgent('union-direct-agent');
    const inheritedAgent = await makeAgent('union-inherited-agent');
    const skill = await makeSkill('union-diff-skill');
    await agentsRepo.setContextDocs(directAgent.id, [path]);
    await skillsRepo.setContextDocs(skill.id, [path]);
    await agentsRepo.linkSkill(inheritedAgent.id, skill.id, 0);

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount).toBe(2);
  });

  it('a disabled agent_skills link excludes the agent from inheritance', async () => {
    const path = 'specs/disabled-link.md';
    const agent = await makeAgent('disabled-link-agent');
    const skill = await makeSkill('disabled-link-skill');
    await skillsRepo.setContextDocs(skill.id, [path]);
    await agentsRepo.linkSkill(agent.id, skill.id, 0);
    await agentsRepo.updateSkillLink(agent.id, skill.id, { enabled: false });

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount ?? 0).toBe(0);
  });

  it('a disabled skill excludes every agent linked to it from inheritance', async () => {
    const path = 'specs/disabled-skill.md';
    const agent = await makeAgent('disabled-skill-agent');
    const skill = await makeSkill('disabled-skill-skill', false);
    await skillsRepo.setContextDocs(skill.id, [path]);
    await agentsRepo.linkSkill(agent.id, skill.id, 0);

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount ?? 0).toBe(0);
  });

  it('a disabled agent is still counted for a direct attach (agentCount reflects configuration, not liveness)', async () => {
    const path = 'specs/disabled-agent-direct.md';
    const agent = await makeAgent('disabled-agent-direct', false);
    await agentsRepo.setContextDocs(agent.id, [path]);

    const map = await repo.usageCounts(WS_ID, [path]);
    expect(map.get(path)?.agentCount).toBe(1);
  });

  it('only aggregates over the passed paths, ignoring attaches for other paths', async () => {
    const attachedPath = 'specs/scoped-in.md';
    const otherPath = 'specs/scoped-out.md';
    const agent = await makeAgent('scoped-agent');
    await agentsRepo.setContextDocs(agent.id, [attachedPath, otherPath]);

    const map = await repo.usageCounts(WS_ID, [attachedPath]);
    expect(map.get(attachedPath)?.agentCount).toBe(1);
    expect(map.has(otherPath)).toBe(false);
  });

  it('an empty paths array returns an empty map without querying', async () => {
    const map = await repo.usageCounts(WS_ID, []);
    expect(map.size).toBe(0);
  });
});
