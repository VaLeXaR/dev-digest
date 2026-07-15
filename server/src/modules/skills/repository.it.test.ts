import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type Db } from '../../db/client.js';
import { runMigrations } from '../../db/migrate.js';
import * as t from '../../db/schema.js';
import { SkillsRepository } from './repository.js';

let stop: () => Promise<void>;
let db: Db;
let repo: SkillsRepository;
const WS_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_WS_ID = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url);
  db = handle.db;
  stop = handle.close;
  // Seed workspaces so FK constraints pass
  await db.insert(t.workspaces).values({ id: WS_ID, name: 'test-workspace' }).onConflictDoNothing();
  await db
    .insert(t.workspaces)
    .values({ id: OTHER_WS_ID, name: 'other-workspace' })
    .onConflictDoNothing();
  repo = new SkillsRepository(db);
}, 60_000);

afterAll(() => stop());

describe('SkillsRepository', () => {
  it('insert + list', async () => {
    await repo.insert({ workspaceId: WS_ID, name: 'test-skill', description: 'desc', type: 'rubric', source: 'manual', body: '# body' });
    const rows = await repo.list(WS_ID);
    expect(rows.some((r) => r.name === 'test-skill')).toBe(true);
  });

  it('update bumps version when body changes', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'v-skill', description: '', type: 'custom', source: 'manual', body: 'v1' });
    expect(inserted.version).toBe(1);
    const updated = await repo.update(WS_ID, inserted.id, { body: 'v2' });
    expect(updated?.version).toBe(2);
  });

  it('update does NOT bump version when only enabled changes', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'tog-skill', description: '', type: 'custom', source: 'manual', body: 'x' });
    const updated = await repo.update(WS_ID, inserted.id, { enabled: false });
    expect(updated?.version).toBe(1);
  });

  it('deleteById removes the row', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'del-skill', description: '', type: 'custom', source: 'manual', body: 'x' });
    const ok = await repo.deleteById(WS_ID, inserted.id);
    expect(ok).toBe(true);
    const found = await repo.getById(WS_ID, inserted.id);
    expect(found).toBeUndefined();
  });

  it('listVersions returns snapshots newest first', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'hist-skill', description: '', type: 'custom', source: 'manual', body: 'v1' });
    await repo.update(WS_ID, inserted.id, { body: 'v2' });
    const versions = await repo.listVersions(inserted.id);
    expect(versions[0]?.version).toBe(2);
    expect(versions[1]?.version).toBe(1);
  });

  it('setContextDocs stores paths in order and bumps version + snapshots skill_versions (D2)', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'ctx-skill', description: '', type: 'custom', source: 'manual', body: 'v1' });
    expect(inserted.version).toBe(1);

    const updated = await repo.setContextDocs(inserted.id, ['docs/b.md', 'docs/a.md']);
    expect(updated?.version).toBe(2);

    const paths = await repo.contextDocPaths(inserted.id);
    expect(paths).toEqual(['docs/b.md', 'docs/a.md']);

    const versions = await repo.listVersions(inserted.id);
    expect(versions[0]?.version).toBe(2);
    expect(versions[0]?.body).toBe('v1');
  });

  it('setContextDocs replaces the previous set (delete-then-bulk-insert) and bumps again', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'ctx-skill-2', description: '', type: 'custom', source: 'manual', body: 'v1' });
    await repo.setContextDocs(inserted.id, ['docs/a.md']);
    const second = await repo.setContextDocs(inserted.id, ['docs/c.md']);
    expect(second?.version).toBe(3);

    const paths = await repo.contextDocPaths(inserted.id);
    expect(paths).toEqual(['docs/c.md']);
  });

  // `skills/service.ts`'s `contextDocs`/`setContextDocs` gate entirely on
  // `getById(workspaceId, skillId)` returning a row before touching
  // `contextDocPaths`/`setContextDocs` — this is the actual DB-level
  // enforcement the route-level 404 tests (routes.test.ts, mocked repo)
  // cannot prove. A skill created under one workspace must be invisible to a
  // lookup scoped to a different workspace, even with the correct id.
  it('getById returns undefined when looked up with a workspaceId the skill does not belong to (workspace isolation / IDOR)', async () => {
    const inserted = await repo.insert({ workspaceId: WS_ID, name: 'ctx-idor-skill', description: '', type: 'custom', source: 'manual', body: 'v1' });

    const crossWorkspaceLookup = await repo.getById(OTHER_WS_ID, inserted.id);
    expect(crossWorkspaceLookup).toBeUndefined();

    // Sanity: the same id resolves fine when scoped to its real workspace.
    const sameWorkspaceLookup = await repo.getById(WS_ID, inserted.id);
    expect(sameWorkspaceLookup?.id).toBe(inserted.id);
  });
});
