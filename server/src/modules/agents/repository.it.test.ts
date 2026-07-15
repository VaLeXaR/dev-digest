import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type Db } from '../../db/client.js';
import { runMigrations } from '../../db/migrate.js';
import * as t from '../../db/schema.js';
import { AgentsRepository } from './repository.js';

/**
 * DB-backed test for `AgentsRepository.setContextDocs`/`contextDocPaths` — the
 * persistence + version-bump behaviour (D2) that a hermetic route test cannot
 * exercise, since it mocks the repository. Mirrors `skills/repository.it.test.ts`.
 */

let stop: () => Promise<void>;
let db: Db;
let repo: AgentsRepository;
const WS_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_WS_ID = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url);
  db = handle.db;
  stop = handle.close;
  await db.insert(t.workspaces).values({ id: WS_ID, name: 'test-workspace' }).onConflictDoNothing();
  await db
    .insert(t.workspaces)
    .values({ id: OTHER_WS_ID, name: 'other-workspace' })
    .onConflictDoNothing();
  repo = new AgentsRepository(db);
}, 60_000);

afterAll(() => stop());

async function makeAgent(name: string) {
  return repo.insert({
    workspaceId: WS_ID,
    name,
    provider: 'openrouter',
    model: 'test-model',
    systemPrompt: 'be helpful',
  });
}

describe('AgentsRepository.setContextDocs / contextDocPaths', () => {
  it('PUT then GET returns paths in order', async () => {
    const agent = await makeAgent('ctx-order');
    await repo.setContextDocs(agent.id, ['specs/a.md', 'docs/b.md']);
    const paths = await repo.contextDocPaths(agent.id);
    expect(paths).toEqual(['specs/a.md', 'docs/b.md']);
  });

  it('a reorder replaces the order', async () => {
    const agent = await makeAgent('ctx-reorder');
    await repo.setContextDocs(agent.id, ['specs/a.md', 'docs/b.md']);
    await repo.setContextDocs(agent.id, ['docs/b.md', 'specs/a.md']);
    const paths = await repo.contextDocPaths(agent.id);
    expect(paths).toEqual(['docs/b.md', 'specs/a.md']);
  });

  it('bumps agent.version and snapshots agent_versions after a real change', async () => {
    const agent = await makeAgent('ctx-bump');
    expect(agent.version).toBe(1);

    await repo.setContextDocs(agent.id, ['specs/a.md']);

    const updated = await repo.getById(WS_ID, agent.id);
    expect(updated?.version).toBe(2);

    const versions = await repo.listVersions(agent.id);
    expect(versions.some((v) => v.version === 2)).toBe(true);
  });

  it('does NOT bump version when the set is unchanged', async () => {
    const agent = await makeAgent('ctx-nobump');
    await repo.setContextDocs(agent.id, ['specs/a.md', 'docs/b.md']);
    const afterFirst = await repo.getById(WS_ID, agent.id);
    expect(afterFirst?.version).toBe(2);

    await repo.setContextDocs(agent.id, ['specs/a.md', 'docs/b.md']);
    const afterSecond = await repo.getById(WS_ID, agent.id);
    expect(afterSecond?.version).toBe(2);
  });

  it('an empty paths array clears all attached docs', async () => {
    const agent = await makeAgent('ctx-clear');
    await repo.setContextDocs(agent.id, ['specs/a.md']);
    await repo.setContextDocs(agent.id, []);
    const paths = await repo.contextDocPaths(agent.id);
    expect(paths).toEqual([]);
  });
});

describe('AgentsRepository.getById — workspace isolation (IDOR)', () => {
  // `agents/service.ts`'s `contextDocs`/`setContextDocs` gate entirely on
  // `getById(workspaceId, agentId)` returning a row before touching
  // `contextDocPaths`/`setContextDocs` — this is the actual DB-level
  // enforcement the route-level 404 tests (routes.test.ts, mocked repo)
  // cannot prove. An agent created under one workspace must be invisible to
  // a lookup scoped to a different workspace, even with the correct id.
  it('returns undefined when looked up with a workspaceId the agent does not belong to', async () => {
    const agent = await makeAgent('ctx-idor');

    const crossWorkspaceLookup = await repo.getById(OTHER_WS_ID, agent.id);
    expect(crossWorkspaceLookup).toBeUndefined();

    // Sanity: the same id resolves fine when scoped to its real workspace.
    const sameWorkspaceLookup = await repo.getById(WS_ID, agent.id);
    expect(sameWorkspaceLookup?.id).toBe(agent.id);
  });
});
