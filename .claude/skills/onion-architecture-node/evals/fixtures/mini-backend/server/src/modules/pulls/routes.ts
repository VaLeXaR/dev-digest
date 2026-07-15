import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PullsService } from './service';
import { mapReviewSummary } from '../reviews/helpers';

const service = new PullsService();

export async function pullRoutes(fastify: FastifyInstance) {
  fastify.get('/pulls/:id/review-summary', {
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req: any) => {
    const row = await service.getLatestReview(req.params.id, req.ctx.workspaceId);
    return row ? mapReviewSummary(row as any) : null;
  });
}
