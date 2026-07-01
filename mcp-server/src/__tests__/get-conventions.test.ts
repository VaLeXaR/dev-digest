import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../tools/get-conventions.js';
import type { ApiClient } from '../lib/api-client.js';

const REPO_ID = '00000000-0000-0000-0000-000000000001';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgents: vi.fn(),
    startReview: vi.fn(),
    listRuns: vi.fn(),
    getReviews: vi.fn(),
    getConventions: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ApiClient;
}

async function setupServer(client: ApiClient) {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  register(server, client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });
  await mcpClient.connect(clientTransport);
  return mcpClient;
}

describe('get_conventions tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) returns conventions with only { rule, accepted } fields, preserving null', async () => {
    const apiClient = makeClient({
      getConventions: vi.fn().mockResolvedValue([
        { id: 'c1', rule: 'Use single quotes', accepted: true },
        { id: 'c2', rule: 'No var', accepted: false },
        { id: 'c3', rule: 'Max line length 120', accepted: null },
      ]),
    });

    const mcpClient = await setupServer(apiClient);
    const result = await mcpClient.callTool({
      name: 'get_conventions',
      arguments: { repo_id: REPO_ID },
    });

    expect(result.isError).toBeFalsy();

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text ?? '{}') as { conventions: unknown[] };

    expect(parsed.conventions).toHaveLength(3);

    const c0 = parsed.conventions[0] as Record<string, unknown>;
    expect(c0).toEqual({ rule: 'Use single quotes', accepted: true });
    expect(c0).not.toHaveProperty('id');

    const c1 = parsed.conventions[1] as Record<string, unknown>;
    expect(c1).toEqual({ rule: 'No var', accepted: false });

    const c2 = parsed.conventions[2] as Record<string, unknown>;
    expect(c2).toEqual({ rule: 'Max line length 120', accepted: null });
    // null must survive JSON round-trip as null, not coerced to false or undefined
    expect(c2['accepted']).toBeNull();
  });

  it('(b) returns isError when no conventions exist', async () => {
    const apiClient = makeClient({
      getConventions: vi.fn().mockResolvedValue([]),
    });

    const mcpClient = await setupServer(apiClient);
    const result = await mcpClient.callTool({
      name: 'get_conventions',
      arguments: { repo_id: REPO_ID },
    });

    expect(result.isError).toBe(true);

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toBe(
      'No conventions found for this repo. Conventions must be extracted first via the DevDigest UI.',
    );
  });
});
