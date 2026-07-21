import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MultiAgentRunCreateRequest, MultiAgentEstimateRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MultiAgentRunsService } from './service.js';

/**
 * multi-agent-runs module (Transport).
 *   POST /pulls/:id/multi-agent-runs           {agentIds}  → fan out N agents; returns {multiRunId, runs}
 *   POST /pulls/:id/multi-agent-runs/estimate  {agentIds}  → pre-run cost/duration estimate
 *   GET    /multi-agent-runs/:id                           → detail (agents + cross-agent groups)
 *   DELETE /multi-agent-runs/:id                           → unlink-delete a run (agent_runs kept)
 *   GET    /pulls/:id/multi-agent-runs                     → history list for a PR
 *
 * Zod-first via `schema.body`/`schema.params` — no manual `.parse()` in handlers.
 * Every read/write is workspace-scoped via `getContext` (R4/AC-7, AC-8).
 */
export default async function multiAgentRunsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new MultiAgentRunsService(container);

  // ---- Run N agents over a PR (fans out to expensive LLM runs) ------------
  // Tight per-route limit, mirroring /pulls/:id/review.
  app.post(
    '/pulls/:id/multi-agent-runs',
    {
      schema: { params: IdParams, body: MultiAgentRunCreateRequest },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createMultiRun(workspaceId, req.params.id, req.body.agentIds, req.log);
    },
  );

  // ---- Pre-run cost/duration estimate --------------------------------------
  app.post(
    '/pulls/:id/multi-agent-runs/estimate',
    { schema: { params: IdParams, body: MultiAgentEstimateRequest } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.estimate(workspaceId, req.params.id, req.body.agentIds);
    },
  );

  // ---- Detail: agents + cross-agent "where agents disagree" groups --------
  app.get('/multi-agent-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getMultiRun(workspaceId, req.params.id);
  });

  // ---- Delete (unlink) a run — linked agent_runs keep their history ---------
  app.delete('/multi-agent-runs/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service.deleteMultiRun(workspaceId, req.params.id);
    return reply.code(204).send();
  });

  // ---- History list for a PR -----------------------------------------------
  app.get('/pulls/:id/multi-agent-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listMultiRuns(workspaceId, req.params.id);
  });

  // ---- Recent runs across a repo (newest first) — the /multi-agent-review landing source
  app.get('/repos/:id/multi-agent-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRunsForRepo(workspaceId, req.params.id);
  });
}
