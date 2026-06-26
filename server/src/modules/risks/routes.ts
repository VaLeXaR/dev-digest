import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RisksService } from './service.js';

const risksRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RisksService(app.container);

  // GET /pulls/:id/risks
  // Returns the stored risks for a PR, or 404 when none has been generated yet.
  app.get(
    '/pulls/:id/risks',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.get(req.params.id, workspaceId);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return result;
    },
  );

  // POST /pulls/:id/risks/generate
  // Runs the full risks-generation pipeline for a PR and returns the result.
  app.post(
    '/pulls/:id/risks/generate',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(req.params.id, workspaceId);
    },
  );
};

export default risksRoutes;
