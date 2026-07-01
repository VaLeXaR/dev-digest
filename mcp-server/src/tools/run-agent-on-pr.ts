import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, Review } from '../lib/api-client.js';
import { ApiError } from '../lib/api-client.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    'run_agent_on_pr',
    {
      description: 'Run a review agent on a pull request and return findings when complete.',
      inputSchema: {
        pull_id: z.string().uuid(),
        agent_id: z.string().uuid(),
      },
    },
    async ({ pull_id, agent_id }) => {
      // 1. Start review
      let runId: string;
      try {
        const result = await client.startReview(pull_id, agent_id);
        const run = result.runs[0];
        if (!run) {
          return { content: [{ type: 'text' as const, text: 'No run was created.' }], isError: true };
        }
        runId = run.id;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
          return { content: [{ type: 'text' as const, text: 'Agent not found. Call list_agents to see available agents.' }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Review failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }

      // 2. Poll until done, failed, or timeout
      const startTime = Date.now();
      const TIMEOUT_MS = 120_000;
      const POLL_INTERVAL_MS = 2_000;

      while (Date.now() - startTime < TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS);
        try {
          const runs = await client.listRuns(pull_id);
          const targetRun = runs.find((r) => r.id === runId);
          if (!targetRun) continue;
          if (targetRun.status === 'done') break;
          if (targetRun.status === 'failed' || targetRun.status === 'cancelled') {
            return { content: [{ type: 'text' as const, text: 'Review failed. Check the DevDigest UI for details.' }], isError: true };
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            return { content: [{ type: 'text' as const, text: 'Pull request not found. Verify the pull_id.' }], isError: true };
          }
          return { content: [{ type: 'text' as const, text: `Review failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
        }
      }

      // Check if we exited the loop due to timeout
      if (Date.now() - startTime >= TIMEOUT_MS) {
        return { content: [{ type: 'text' as const, text: 'Review timed out after 120s. The run may still complete — call get_findings with pull_id to check.' }], isError: true };
      }

      // 3. Get findings from the most recent review
      try {
        const reviews = await client.getReviews(pull_id);
        const review = reviews[reviews.length - 1];
        if (!review) {
          return { content: [{ type: 'text' as const, text: 'Review completed but no findings were returned.' }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(shapeReview(review)) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed to retrieve findings: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );
}
