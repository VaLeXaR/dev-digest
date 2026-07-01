import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../tools/get-findings.js';
import type { ApiClient } from '../lib/api-client.js';

const PULL_ID = '00000000-0000-0000-0000-000000000001';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgents: vi.fn(),
    startReview: vi.fn(),
    listRuns: vi.fn(),
    getReviews: vi.fn().mockResolvedValue([]),
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

describe('get_findings tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) returns shaped review on success without internal id field', async () => {
    const apiClient = makeClient({
      getReviews: vi.fn().mockResolvedValue([
        {
          id: 'rev-1',
          score: 7,
          verdict: 'Needs work',
          findings: [
            {
              id: 'f1',
              severity: 'high',
              title: 'SQL injection',
              file: 'src/db.ts',
              line: 10,
              body: 'Use parameterized queries',
            },
          ],
        },
      ]),
    });

    const mcpClient = await setupServer(apiClient);
    const result = await mcpClient.callTool({
      name: 'get_findings',
      arguments: { pull_id: PULL_ID },
    });

    expect(result.isError).toBeFalsy();

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text ?? '{}') as {
      verdict: string;
      score: number;
      finding_count: number;
      findings: Record<string, unknown>[];
    };

    expect(parsed).toEqual({
      verdict: 'Needs work',
      score: 7,
      finding_count: 1,
      findings: [
        {
          severity: 'high',
          title: 'SQL injection',
          file: 'src/db.ts',
          line: 10,
          body: 'Use parameterized queries',
        },
      ],
    });

    expect(parsed.findings[0]).not.toHaveProperty('id');
  });

  it('(b) returns isError when no reviews exist', async () => {
    const apiClient = makeClient({
      getReviews: vi.fn().mockResolvedValue([]),
    });

    const mcpClient = await setupServer(apiClient);
    const result = await mcpClient.callTool({
      name: 'get_findings',
      arguments: { pull_id: PULL_ID },
    });

    expect(result.isError).toBe(true);

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toBe(
      'No completed reviews found for this PR. Run run_agent_on_pr first.',
    );
  });
});
