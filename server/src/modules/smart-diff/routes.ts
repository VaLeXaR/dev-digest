import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

const smartDiffRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  // GET /pulls/:id/smart-diff
  // Returns the smart-diff classification for a PR.
  // NotFoundError from the service maps to 404 via the platform error handler.
  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(req.params.id, workspaceId);
    },
  );
};

export default smartDiffRoutes;
