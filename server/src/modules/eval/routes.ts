import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseFromFindingInput, EvalCaseInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';
import type { EvalCaseUpdate } from './repository.js';

/** `PATCH /eval-cases/:id` — same shape as create minus the immutable owner fields. */
const EvalCaseUpdateBody: z.ZodType<EvalCaseUpdate> = EvalCaseInput.omit({
  owner_kind: true,
  owner_id: true,
}).partial();

/** `GET /findings/eval-cases?ids=a,b,c` — comma-separated finding ids (AC-26 hint). */
const FindingsEvalCasesQuery = z.object({ ids: z.string().min(1) });

/**
 * A5/T-07 — eval routes (transport only, no business logic here — everything
 * goes through `EvalService`).
 *   POST   /agents/:id/eval-runs             → run the whole set (rate-limited, C2/AC-27)
 *   GET    /agents/:id/eval-cases            → list the agent's eval cases (R2)
 *   GET    /agents/:id/eval-cases/last-runs  → per-case latest run, batch or scratch (R2/AC-4)
 *   POST   /agents/:id/eval-cases            → create a case
 *   PATCH  /eval-cases/:id                   → update a case
 *   DELETE /eval-cases/:id                   → delete a case
 *   POST   /eval-cases/:id/run               → run one case (design/05)
 *   POST   /agents/:id/eval-cases/from-finding → create a case from a finding (R1/AC-26)
 *   GET    /agents/:id/eval/dashboard        → single-agent detail
 *   GET    /eval/dashboard                   → cross-agent overview (R9)
 *   GET    /agents/:id/eval-batches          → batch history
 *   GET    /eval-batches/:id/runs            → per-case drill-down for a batch
 *   GET    /findings/eval-cases              → which finding ids already back a case (AC-26 hint)
 *   POST   /skills/:id/eval-runs             → run the skill's whole set (rate-limited, R4/AC-33)
 *   GET    /skills/:id/eval-cases            → list the skill's eval cases (R2/AC-29)
 *   GET    /skills/:id/eval-cases/last-runs  → per-case latest run for a skill (R2/AC-29)
 *   POST   /skills/:id/eval-cases            → create a case for a skill (R3/AC-30)
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container);

  // ---- run orchestration ---------------------------------------------------

  // Tight per-route limit, identical to reviews/routes.ts:29 — AC-27's
  // sequential "run all agents" fan-out shares one 10/min budget (C2).
  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runSet(workspaceId, req.params.id);
    },
  );

  app.post('/eval-cases/:id/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.runCase(workspaceId, req.params.id);
  });

  // ---- case CRUD ------------------------------------------------------------

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listCases(workspaceId, req.params.id);
  });

  // Per-case latest run (batch or scratch, R2/AC-4/G7).
  app.get('/agents/:id/eval-cases/last-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.lastRunsForAgent(workspaceId, req.params.id);
  });

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const evalCase = await service.createCase(workspaceId, req.body);
      reply.status(201);
      return evalCase;
    },
  );

  app.patch(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseUpdateBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const evalCase = await service.updateCase(workspaceId, req.params.id, req.body);
      if (!evalCase) throw new NotFoundError('Eval case not found');
      return evalCase;
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id);
    return { ok };
  });

  // ---- create from finding (R1/AC-1/AC-2/AC-3/AC-26) -------------------------

  app.post(
    '/agents/:id/eval-cases/from-finding',
    { schema: { params: IdParams, body: EvalCaseFromFindingInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const evalCase = await service.createCaseFromFinding(workspaceId, req.body);
      reply.status(201);
      return evalCase;
    },
  );

  // ---- dashboard (R9) ---------------------------------------------------------

  app.get('/agents/:id/eval/dashboard', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.dashboard(workspaceId, req.params.id);
  });

  app.get('/eval/dashboard', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.dashboard(workspaceId);
  });

  // ---- batch history / drill-down --------------------------------------------

  app.get('/agents/:id/eval-batches', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listBatches(workspaceId, req.params.id);
  });

  app.get('/eval-batches/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.batchRuns(workspaceId, req.params.id);
  });

  // ---- AC-26 hint: findings already backing a case ---------------------------

  app.get(
    '/findings/eval-cases',
    { schema: { querystring: FindingsEvalCasesQuery } },
    async (req) => {
      await getContext(container, req);
      const ids = req.query.ids
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const found = await service.findingsWithCases(ids);
      return { finding_ids: [...found] };
    },
  );

  // ---- skill eval routes (R2/R3/R4/AC-29/AC-30/AC-33) ------------------------

  // Same 10/min budget as the agent run route — both "Run all evals" and
  // "Run on evals" hit this one route (R4/AC-33).
  app.post(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runSkillSet(workspaceId, req.params.id);
    },
  );

  app.get('/skills/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listSkillCases(workspaceId, req.params.id);
  });

  app.get('/skills/:id/eval-cases/last-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.lastRunsForSkill(workspaceId, req.params.id);
  });

  app.post(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const evalCase = await service.createCase(workspaceId, req.body);
      reply.status(201);
      return evalCase;
    },
  );
}
