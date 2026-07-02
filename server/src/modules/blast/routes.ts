import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBlastRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

const blastRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  // GET /pulls/:id/blast
  // Returns the computed blast radius for a PR, or 404 when the PR is unknown.
  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: PrBlastRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(req.params.id, workspaceId);
    },
  );

  // POST /pulls/:id/blast/summary
  // Generates (exactly one LLM call) and persists the "Explain" summary for a PR.
  app.post(
    '/pulls/:id/blast/summary',
    { schema: { params: IdParams, response: { 200: PrBlastRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generateSummary(req.params.id, workspaceId);
    },
  );
};

export default blastRoutes;
