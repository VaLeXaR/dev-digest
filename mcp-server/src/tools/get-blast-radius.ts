import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../lib/api-client.js';

export function register(server: McpServer, client: ApiClient): void {
  void client; // unused — stub makes no API calls
  server.registerTool(
    'get_blast_radius',
    {
      description: 'Get the blast radius of a pull request (not yet implemented — always returns an error).',
      inputSchema: { pull_id: z.string().uuid() },
    },
    async () => ({
      content: [{ type: 'text' as const, text: 'get_blast_radius is not yet implemented.' }],
      isError: true,
    }),
  );
}
