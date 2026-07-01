import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../tools/run-agent-on-pr.js';
import { ApiError } from '../lib/api-client.js';
import type { ApiClient } from '../lib/api-client.js';

const PULL_ID = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000002';
const RUN_ID = '00000000-0000-0000-0000-000000000003';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgents: vi.fn(),
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

describe('run_agent_on_pr tool', () => {
  describe('(a) success — returns shaped findings', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('polls until done and returns shaped review', async () => {
      const client = makeClient({
        startReview: vi.fn().mockResolvedValue({
          runs: [{ id: RUN_ID, status: 'pending' }],
        }),
        listRuns: vi.fn()
          .mockResolvedValueOnce([{ id: RUN_ID, status: 'running' }])
          .mockResolvedValueOnce([{ id: RUN_ID, status: 'done' }]),
        getReviews: vi.fn().mockResolvedValue([
          {
            id: 'rev-1',
            score: 8,
            verdict: 'LGTM',
            findings: [
              {
                id: 'f1',
                severity: 'low',
                title: 'Minor issue',
                file: 'src/foo.ts',
                line: 42,
                body: 'Check this',
              },
            ],
          },
        ]),
      });

      const mcpClient = await setupServer(client);

      const resultPromise = mcpClient.callTool({
        name: 'run_agent_on_pr',
        arguments: { pull_id: PULL_ID, agent_id: AGENT_ID },
      });

      // Advance past first poll interval (2s) — first listRuns call returns 'running'
      await vi.advanceTimersByTimeAsync(2100);
      // Advance past second poll interval — second listRuns call returns 'done'
      await vi.advanceTimersByTimeAsync(2100);

      const result = await resultPromise;

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed).toMatchObject({
        verdict: 'LGTM',
        score: 8,
        finding_count: 1,
        findings: [
          {
            severity: 'low',
            title: 'Minor issue',
            file: 'src/foo.ts',
            line: 42,
            body: 'Check this',
          },
        ],
      });
    });
  });

  describe('(b) agent not found — 404 from startReview', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns isError with list_agents hint', async () => {
      const client = makeClient({
        startReview: vi.fn().mockRejectedValue(new ApiError('Not Found', 404)),
      });

      const mcpClient = await setupServer(client);

      const result = await mcpClient.callTool({
        name: 'run_agent_on_pr',
        arguments: { pull_id: PULL_ID, agent_id: AGENT_ID },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Call list_agents');
    });
  });

  describe('(c) timeout — listRuns always returns running', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('returns isError with timeout message after 120s', async () => {
      const client = makeClient({
        startReview: vi.fn().mockResolvedValue({
          runs: [{ id: RUN_ID, status: 'pending' }],
        }),
        listRuns: vi.fn().mockResolvedValue([{ id: RUN_ID, status: 'running' }]),
      });

      const mcpClient = await setupServer(client);

      // Pass a timeout larger than the tool's 120s limit so the MCP SDK doesn't
      // fire its own 60s default request timeout before the tool can return.
      const resultPromise = mcpClient.callTool(
        { name: 'run_agent_on_pr', arguments: { pull_id: PULL_ID, agent_id: AGENT_ID } },
        undefined,
        { timeout: 130_000 },
      );

      // Advance past the 120s timeout
      await vi.advanceTimersByTimeAsync(121_000);

      const result = await resultPromise;

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('timed out after 120s');
    });
  });
});
