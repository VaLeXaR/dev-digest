import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider } from '../../adapters/mocks.js';
import { AgentsRepository } from './repository.js';
import type { AgentRow } from '../../db/rows.js';

/**
 * Route-level test for GET/PUT /agents/:id/context-docs via app.inject() — no
 * DB, no Docker (postgres-js connects lazily; nothing here reaches it since
 * `AgentsRepository.prototype` is mocked, mirroring `blast/routes.test.ts`).
 * Covers HTTP wiring (params/body validation, 404, response shape) and the
 * PUT→GET / reorder round trip at the route level via a stateful mock. The
 * real persistence + version-bump behaviour (D2) is covered by the DB-backed
 * `repository.it.test.ts`, since mocking the repository here would hide it.
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function buildAgentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: AGENT_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Test Agent',
    description: '',
    provider: 'openrouter',
    model: 'test-model',
    systemPrompt: 'be helpful',
    outputSchema: null,
    enabled: true,
    version: 1,
    strategy: 'auto',
    ciFailOn: 'critical',
    repoIntel: false,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AgentRow;
}

async function makeApp() {
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

describe('GET/PUT /agents/:id/context-docs (no DB)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET returns 404 when the agent is unknown', async () => {
    vi.spyOn(AgentsRepository.prototype, 'getById').mockResolvedValue(undefined);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/context-docs` });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('PUT returns 404 when the agent is unknown', async () => {
    vi.spyOn(AgentsRepository.prototype, 'getById').mockResolvedValue(undefined);

    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${AGENT_ID}/context-docs`,
      payload: { paths: ['specs/a.md'] },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT paths then GET returns them in order; a reorder replaces the order', async () => {
    vi.spyOn(AgentsRepository.prototype, 'getById').mockResolvedValue(buildAgentRow());
    let stored: string[] = [];
    vi.spyOn(AgentsRepository.prototype, 'setContextDocs').mockImplementation(
      async (_agentId, paths) => {
        stored = paths;
      },
    );
    vi.spyOn(AgentsRepository.prototype, 'contextDocPaths').mockImplementation(async () => stored);

    const app = await makeApp();

    const put1 = await app.inject({
      method: 'PUT',
      url: `/agents/${AGENT_ID}/context-docs`,
      payload: { paths: ['specs/a.md', 'docs/b.md'] },
    });
    expect(put1.statusCode).toBe(200);
    expect(put1.json()).toEqual({ paths: ['specs/a.md', 'docs/b.md'] });

    const get1 = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/context-docs` });
    expect(get1.statusCode).toBe(200);
    expect(get1.json()).toEqual({ paths: ['specs/a.md', 'docs/b.md'] });

    const put2 = await app.inject({
      method: 'PUT',
      url: `/agents/${AGENT_ID}/context-docs`,
      payload: { paths: ['docs/b.md', 'specs/a.md'] },
    });
    expect(put2.statusCode).toBe(200);
    expect(put2.json()).toEqual({ paths: ['docs/b.md', 'specs/a.md'] });

    const get2 = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/context-docs` });
    expect(get2.json()).toEqual({ paths: ['docs/b.md', 'specs/a.md'] });

    await app.close();
  });

  it('rejects a body missing `paths`', async () => {
    vi.spyOn(AgentsRepository.prototype, 'getById').mockResolvedValue(buildAgentRow());

    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${AGENT_ID}/context-docs`,
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

/**
 * POST /agents/:id/versions/:version/promote (T-06, AC-20). Hermetic: mocks
 * `AgentsRepository.prototype.getVersion` + `.update()` (not `.promoteVersion`
 * itself) so the real repository glue — reading the snapshot's configJson and
 * mapping it onto an `update()` patch — actually executes and is asserted on,
 * without touching Postgres (`update()`'s own DB call is what's stubbed).
 */
describe('POST /agents/:id/versions/:version/promote', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildVersionRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      agentId: AGENT_ID,
      version: 3,
      configJson: {
        provider: 'openrouter',
        model: 'snapshot-model',
        system_prompt: 'be a snapshot',
        output_schema: null,
        strategy: 'auto',
        ci_fail_on: 'critical',
        repo_intel: true,
        skills: ['skill-a', 'skill-b'],
      },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  it('promotes a valid version: returns the updated Agent with the snapshot applied and version incremented', async () => {
    vi.spyOn(AgentsRepository.prototype, 'getVersion').mockResolvedValue(
      buildVersionRow() as never,
    );

    const callOrder: string[] = [];
    let updatePatch: unknown;
    const setSkillsSpy = vi
      .spyOn(AgentsRepository.prototype, 'setSkills')
      .mockImplementation(async () => {
        callOrder.push('setSkills');
      });
    vi.spyOn(AgentsRepository.prototype, 'update').mockImplementation(
      async (_workspaceId, _id, patch) => {
        callOrder.push('update');
        updatePatch = patch;
        return buildAgentRow({
          provider: 'openrouter',
          model: 'snapshot-model',
          systemPrompt: 'be a snapshot',
          outputSchema: null,
          strategy: 'auto',
          ciFailOn: 'critical',
          repoIntel: true,
          version: 4,
        });
      },
    );

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/versions/3/promote`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(4);
    expect(body.model).toBe('snapshot-model');
    expect(body.system_prompt).toBe('be a snapshot');
    expect(updatePatch).toMatchObject({
      provider: 'openrouter',
      model: 'snapshot-model',
      systemPrompt: 'be a snapshot',
      outputSchema: null,
      strategy: 'auto',
      ciFailOn: 'critical',
      repoIntel: true,
    });
    // AC-20/R14: promote must restore the promoted version's linked-skill set,
    // and do so BEFORE update()'s own snapshotVersion() call reads current
    // skills — otherwise the forward version snapshot captures stale skills.
    expect(setSkillsSpy).toHaveBeenCalledWith(AGENT_ID, ['skill-a', 'skill-b']);
    expect(callOrder).toEqual(['setSkills', 'update']);
    await app.close();
  });

  it('returns 404 when promoting a missing version', async () => {
    vi.spyOn(AgentsRepository.prototype, 'getVersion').mockResolvedValue(undefined);

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/versions/99/promote`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });
});
