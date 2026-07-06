import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

const LineContextQuery = z.object({
  file: z.string().min(1),
  line: z.coerce.number().int().positive(),
});

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

  // GET /pulls/:id/line-context?file=<path>&line=<n>
  // A window of raw file lines around `line`, read at the PR's head commit —
  // fallback for a click-to-line target outside every rendered diff hunk.
  // NotFoundError (PR, repo, file, or out-of-range line) maps to 404.
  app.get(
    '/pulls/:id/line-context',
    { schema: { params: IdParams, querystring: LineContextQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getLineContext(req.params.id, workspaceId, req.query.file, req.query.line);
    },
  );
};

export default smartDiffRoutes;
