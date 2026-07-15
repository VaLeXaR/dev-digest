import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { WhyRiskBriefService } from './service.js';

const whyRiskBriefRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new WhyRiskBriefService(app.container);

  // GET /pulls/:id/brief
  // Returns the stored Why+Risk Brief for a PR, or 404 when none has been
  // generated yet. Zero LLM calls (AC-1/SC1).
  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.get(req.params.id, workspaceId);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return result;
    },
  );

  // POST /pulls/:id/brief/generate
  // Runs the full Why+Risk Brief generation pipeline for a PR and returns the result.
  app.post(
    '/pulls/:id/brief/generate',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(req.params.id, workspaceId);
    },
  );
};

export default whyRiskBriefRoutes;
