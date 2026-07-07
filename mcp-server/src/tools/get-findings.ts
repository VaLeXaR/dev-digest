import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, Review } from '../lib/api-client.js';
import { ApiError } from '../lib/api-client.js';

function shapeReview(review: Review) {
  return {
    verdict: review.verdict ?? 'No verdict',
    score: review.score ?? 0,
    finding_count: review.findings.length,
    findings: review.findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      file: f.file,
      line: f.line,
      body: f.body,
    })),
  };
}

export function register(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'get_findings',
    {
      description: 'Get the latest review findings for a pull request that has already been reviewed.',
      inputSchema: { pull_id: z.string().uuid() },
    },
    async ({ pull_id }) => {
      try {
        const reviews = await client.getReviews(pull_id);
        const review = reviews[reviews.length - 1];
        if (!review || reviews.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No completed reviews found for this PR. Run run_agent_on_pr first.' }],
            isError: true,
          };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(shapeReview(review)) }] };
      } catch (err) {
        const msg = err instanceof ApiError
          ? `Failed to get findings: ${err.message}`
          : `Failed to get findings: ${err instanceof Error ? err.message : String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }], isError: true };
      }
    },
  );
}
