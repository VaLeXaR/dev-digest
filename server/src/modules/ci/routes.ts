import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * L07/T-02 — Export-to-CI + CI Runs routes (transport only; all logic lives
 * in `CiService`). Registered with NO prefix (absolute paths below), same as
 * every other feature plugin (`modules/index.ts`).
 *
 *   POST /agents/:id/export-ci        → generate/commit the CI bundle (AC-13…AC-19, AC-44, AC-46)
 *   GET  /agents/:id/ci-installations → installations for one agent (CI tab)
 *   POST /ci-runs/refresh             → pull-based ingest across the workspace (AC-29/30/37/38)
 *   GET  /ci-runs                     → workspace-wide run history (AC-24…AC-28)
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new CiService(container);

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.exportCi(workspaceId, req.params.id, req.body);
    },
  );

  app.get('/agents/:id/ci-installations', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listInstallations(workspaceId, req.params.id);
  });

  app.post('/ci-runs/refresh', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.refreshRuns(workspaceId);
  });

  app.get('/ci-runs', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId);
  });
}
