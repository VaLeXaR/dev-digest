import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './lib/api-client.js';
import { logger } from './lib/logger.js';
import { register as registerListAgents } from './tools/list-agents.js';
import { register as registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { register as registerGetFindings } from './tools/get-findings.js';
import { register as registerGetConventions } from './tools/get-conventions.js';
import { register as registerGetBlastRadius } from './tools/get-blast-radius.js';

const server = new McpServer({
  name: 'devdigest-mcp',
  version: '1.0.0',
});

const client = createApiClient();

registerListAgents(server, client);
registerRunAgentOnPr(server, client);
registerGetFindings(server, client);
registerGetConventions(server, client);
registerGetBlastRadius(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('DevDigest MCP server started');
}

main().catch((err) => {
  console.error('[mcp-server] Fatal error:', err);
  process.exit(1);
});
