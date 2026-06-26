import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';
import { RisksService } from '../risks/service.js';

const intentRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const intentService = new IntentService(app.container);
  const risksService = new RisksService(app.container);

  // GET /pulls/:id/intent
  // Returns the stored intent for a PR, or 404 when none has been generated yet.
  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await intentService.get(req.params.id, workspaceId);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return result;
    },
  );

  // POST /pulls/:id/intent/generate
  // Runs intent + risks generation in parallel and returns the intent record.
  // Risks are written to the DB as a side effect; the risks query is invalidated client-side.
  app.post(
    '/pulls/:id/intent/generate',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const [intent] = await Promise.all([
        intentService.generate(req.params.id, workspaceId),
        risksService.generate(req.params.id, workspaceId),
      ]);
      return intent;
    },
  );
};

export default intentRoutes;
