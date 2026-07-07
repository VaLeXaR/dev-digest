import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../lib/api-client.js';

export function register(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'list_agents',
    {
      description: 'List all configured review agents with their id, name, and description.',
      inputSchema: {},  // no parameters
    },
    async () => {
      try {
        const agents = await client.listAgents();
        const result = {
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            enabled: a.enabled,
          })),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch {
        const msg = `Could not list agents. Is the DevDigest server running at :4001?`;
        return { content: [{ type: 'text' as const, text: msg }], isError: true };
      }
    },
  );
}
