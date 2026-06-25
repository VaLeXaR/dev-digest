import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb } from '../../db/client.js';
import { runMigrations } from '../../db/migrate.js';
import * as t from '../../db/schema.js';
import { SkillsRepository } from './repository.js';

let stop: () => Promise<void>;
let repo: SkillsRepository;
const WS_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const { db, close } = createDb(url);
  stop = close;
  // Seed a workspace so FK constraints pass
  await db.insert(t.workspaces).values({ id: WS_ID, name: 'test-workspace' }).onConflictDoNothing();
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
});
