import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Review, ReviewDiffRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ReviewDiffService } from './service.js';

/**
 * review-diff module.
 *   POST /review/diff  { diff, agentId? }  → synchronous, non-persisted Review
 *
 * Ad-hoc review of a raw working-copy diff string (no PR). Reuses the exact
 * same review engine the PR-page flow uses via `ReviewDiffService`.
 */
const reviewDiffRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ReviewDiffService(app.container);

  // Tight per-route limit, mirroring the PR review-trigger route: each call
  // triggers an expensive synchronous LLM run.
  app.post(
    '/review/diff',
    {
      schema: { body: ReviewDiffRequest, response: { 200: Review } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.reviewDiff(workspaceId, req.body.diff, req.body.agentId);
    },
  );
};

export default reviewDiffRoutes;
