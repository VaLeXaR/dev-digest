import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../tools/list-agents.js';
import type { ApiClient } from '../lib/api-client.js';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgents: vi.fn().mockResolvedValue([]),
    startReview: vi.fn(),
    listRuns: vi.fn(),
    getReviews: vi.fn(),
    getConventions: vi.fn(),
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

describe('list_agents tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) returns agents with only allowed fields on success', async () => {
    const apiClient = makeClient({
      listAgents: vi.fn().mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'General',
          description: 'General reviewer',
          enabled: true,
          extra: 'SHOULD NOT APPEAR',
        },
      ]),
    });

    const mcpClient = await setupServer(apiClient);
    const result = await mcpClient.callTool({ name: 'list_agents', arguments: {} });

    expect(result.isError).toBeFalsy();

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text ?? '{}') as { agents: unknown[] };

    expect(parsed.agents).toHaveLength(1);

    const agent = parsed.agents[0] as Record<string, unknown>;
    expect(agent).toEqual({
      id: 'uuid-1',
      name: 'General',
      description: 'General reviewer',
      enabled: true,
    });
    expect(agent).not.toHaveProperty('extra');
  });

  it('(b) returns error message when server is down', async () => {
    const apiClient = makeClient({
      listAgents: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    const mcpClient = await setupServer(apiClient);
    const result = await mcpClient.callTool({ name: 'list_agents', arguments: {} });

    expect(result.isError).toBe(true);

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toBe('Could not list agents. Is the DevDigest server running at :4001?');
  });
});
