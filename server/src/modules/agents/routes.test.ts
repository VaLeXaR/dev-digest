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
