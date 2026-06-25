import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

const PatchConventionBody = z.object({
  rule: z.string().optional(),
  accepted: z.boolean().nullable().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  // POST /repos/:id/conventions/extract
  // Runs full extraction pipeline against the cloned repo; returns candidates.
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(req.params.id, workspaceId);
    },
  );

  // GET /repos/:id/conventions
  // Returns all stored convention candidates for a repo.
  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(req.params.id, workspaceId);
    },
  );

  // PATCH /conventions/:id
  // Update a convention's rule text or accepted flag.
  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(req.params.id, workspaceId, req.body);
    },
  );

  // DELETE /conventions/:id
  // Delete a single convention by ID; returns 204 No Content.
  app.delete(
    '/conventions/:id',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.deleteOne(req.params.id, workspaceId);
      reply.status(204);
    },
  );

  // DELETE /repos/:id/conventions/resolved
  // Delete all accepted + rejected (non-null) conventions; returns 204 No Content.
  app.delete(
    '/repos/:id/conventions/resolved',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.deleteResolved(req.params.id, workspaceId);
      reply.status(204);
    },
  );

  // DELETE /repos/:id/conventions
  // Delete all conventions for a repo; returns 204 No Content.
  app.delete(
    '/repos/:id/conventions',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.deleteAll(req.params.id, workspaceId);
      reply.status(204);
    },
  );
}
