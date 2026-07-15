import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType, SkillPreview, SetContextDocsBody, type ContextDocsResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { SkillsImportService } from './import.service.js';

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  type: SkillType,
  body: z.string().default(''),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

const ImportUrlBody = z.object({ url: z.string().url() });
const ImportConfirmBody = z.object({ previews: z.array(SkillPreview) });

export default async function skillsRoutes(appBase: FastifyInstance) {
  await appBase.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);
  const importSvc = new SkillsImportService();

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    reply.status(201);
    return service.create(workspaceId, { ...req.body, source: 'manual' });
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    reply.status(204);
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/agents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agents = await service.getSkillAgents(workspaceId, req.params.id);
    if (!agents) throw new NotFoundError('Skill not found');
    return agents;
  });

  app.get('/skills/:id/context-docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const paths = await service.contextDocs(workspaceId, req.params.id);
    if (!paths) throw new NotFoundError('Skill not found');
    return { paths } satisfies ContextDocsResponse;
  });

  app.put(
    '/skills/:id/context-docs',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const paths = await service.setContextDocs(workspaceId, req.params.id, req.body.paths);
      if (!paths) throw new NotFoundError('Skill not found');
      return { paths } satisfies ContextDocsResponse;
    },
  );

  app.post('/skills/import/preview-url', { schema: { body: ImportUrlBody } }, async (req) => {
    await getContext(app.container, req);
    return importSvc.previewFromUrl(req.body.url);
  });

  app.post('/skills/import/preview-file', async (req) => {
    await getContext(app.container, req);
    const data = await req.file();
    if (!data) throw new ValidationError('No file in request');
    const buffer = await data.toBuffer();
    return importSvc.previewFromBuffer(buffer, data.filename);
  });

  app.post('/skills/import/confirm', { schema: { body: ImportConfirmBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    reply.status(201);
    return service.importConfirm(workspaceId, req.body.previews);
  });
}
