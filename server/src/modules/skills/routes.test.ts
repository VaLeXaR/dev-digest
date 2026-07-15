import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider } from '../../adapters/mocks.js';
import { SkillsRepository } from './repository.js';
import type { SkillRow } from '../../db/rows.js';

/**
 * Route-level test for the skill context-docs endpoints via app.inject() — no
 * DB, no Docker. Mirrors blast/routes.test.ts: SkillsRepository.prototype is
 * patched directly since SkillsService constructs its own repository (no DI
 * seam), and postgres-js connects lazily so no real Postgres is needed as
 * long as no query actually runs.
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SKILL_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function buildSkillRow(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    id: SKILL_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Test Skill',
    description: 'desc',
    type: 'custom',
    source: 'manual',
    body: '# body',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as SkillRow;
}

async function buildTestApp() {
  return buildApp({
    config,
    overrides: {
      auth: new MockAuthProvider(
        { id: 'u1', email: 'you@local', name: 'You' },
        { id: WORKSPACE_ID, name: 'default' },
      ),
    },
  });
}

describe('GET/PUT /skills/:id/context-docs (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PUT sets ordered paths, then GET returns them in the same order', async () => {
    vi.spyOn(SkillsRepository.prototype, 'getById').mockResolvedValue(buildSkillRow());

    let stored: string[] = [];
    const setContextDocs = vi
      .spyOn(SkillsRepository.prototype, 'setContextDocs')
      .mockImplementation(async (_skillId, paths) => {
        stored = paths;
        return buildSkillRow({ version: 2 });
      });
    vi.spyOn(SkillsRepository.prototype, 'contextDocPaths').mockImplementation(async () => stored);

    const app = await buildTestApp();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/skills/${SKILL_ID}/context-docs`,
      payload: { paths: ['docs/b.md', 'docs/a.md'] },
    });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toEqual({ paths: ['docs/b.md', 'docs/a.md'] });
    expect(setContextDocs).toHaveBeenCalledWith(SKILL_ID, ['docs/b.md', 'docs/a.md']);

    const getRes = await app.inject({ method: 'GET', url: `/skills/${SKILL_ID}/context-docs` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual({ paths: ['docs/b.md', 'docs/a.md'] });

    await app.close();
  });

  it('returns 404 for GET when the skill is unknown', async () => {
    vi.spyOn(SkillsRepository.prototype, 'getById').mockResolvedValue(undefined);

    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: `/skills/${SKILL_ID}/context-docs` });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });

  it('returns 404 for PUT when the skill is unknown', async () => {
    vi.spyOn(SkillsRepository.prototype, 'getById').mockResolvedValue(undefined);
    const setContextDocs = vi.spyOn(SkillsRepository.prototype, 'setContextDocs');

    const app = await buildTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${SKILL_ID}/context-docs`,
      payload: { paths: ['docs/a.md'] },
    });

    expect(res.statusCode).toBe(404);
    expect(setContextDocs).not.toHaveBeenCalled();

    await app.close();
  });
});
