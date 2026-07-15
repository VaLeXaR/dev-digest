import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { reviews } from '../../db/schema';
import { ReviewsService } from './service';

const service = new ReviewsService();

export async function reviewRoutes(fastify: FastifyInstance) {
  fastify.get('/reviews/:id', {
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req: any) => {
    const ctx = req.ctx;
    return service.getReview(req.params.id, ctx.workspaceId);
  });

  fastify.get('/repos/:repoId/reviews', {
    schema: { params: z.object({ repoId: z.string().uuid() }) },
  }, async (req: any) => {
    const ctx = req.ctx;
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.repoId, req.params.repoId), eq(reviews.workspaceId, ctx.workspaceId)));
    return rows.filter((r) => r.status !== 'archived');
  });
}
