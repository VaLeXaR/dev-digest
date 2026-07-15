import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  // GET /repos/:id/onboarding
  // Returns the cached tour (or index_required/not_generated) — no LLM call
  // (R10/AC-12).
  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(req.params.id, workspaceId);
    },
  );

  // POST /repos/:id/onboarding/generate
  // Runs the single-LLM-call generation pipeline and persists the result
  // (R1/R7/R9).
  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(req.params.id, workspaceId);
    },
  );
}
