import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiError } from '../lib/api-client.js';

export function register(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'get_conventions',
    {
      description: 'Get the coding conventions extracted from a repository.',
      inputSchema: { repo_id: z.string().uuid() },
    },
    async ({ repo_id }) => {
      try {
        const conventions = await client.getConventions(repo_id);
        if (conventions.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No conventions found for this repo. Conventions must be extracted first via the DevDigest UI.' }],
            isError: true,
          };
        }
        const result = {
          conventions: conventions.map((c) => ({
            rule: c.rule,
            accepted: c.accepted,  // preserve null — it's tri-state (true/false/null)
          })),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const msg = err instanceof ApiError
          ? `Failed to get conventions: ${err.message}`
          : `Failed to get conventions: ${err instanceof Error ? err.message : String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }], isError: true };
      }
    },
  );
}
