import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateFolderBody,
  CreateFileBody,
  EditDocBody,
  type DiscoveryResponse,
  type DocContentResponse,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ValidationError } from '../../platform/errors.js';
import { MD_EXT } from './constants.js';
import { ProjectContextService } from './service.js';

const ZIP_EXT = '.zip';

const ContentQuery = z.object({ path: z.string().min(1) });
const UploadQuery = z.object({ root_folder: z.string().min(1), path: z.string().min(1) });
const ArchiveQuery = z.object({ root_folder: z.string().min(1) });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  await appBase.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  // GET /repos/:id/context/docs — cached discovery result (AC-1/2/23).
  app.get(
    '/repos/:id/context/docs',
    { schema: { params: IdParams } },
    async (req): Promise<DiscoveryResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.discovery(workspaceId, req.params.id);
    },
  );

  // POST /repos/:id/context/refresh — invalidate + re-scan (AC-3).
  app.post(
    '/repos/:id/context/refresh',
    { schema: { params: IdParams } },
    async (req): Promise<DiscoveryResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refresh(workspaceId, req.params.id);
    },
  );

  // GET /repos/:id/context/content?path= — guarded content read (AC-8).
  app.get(
    '/repos/:id/context/content',
    { schema: { params: IdParams, querystring: ContentQuery } },
    async (req): Promise<DocContentResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getContent(workspaceId, req.params.id, req.query.path);
    },
  );

  // POST /repos/:id/context/folders — mkdir -p under a root folder (AC-31).
  app.post(
    '/repos/:id/context/folders',
    { schema: { params: IdParams, body: CreateFolderBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.createFolder(workspaceId, req.params.id, req.body);
      reply.status(201).send();
    },
  );

  // POST /repos/:id/context/files — inline-content file create (AC-32).
  app.post(
    '/repos/:id/context/files',
    { schema: { params: IdParams, body: CreateFileBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.createFile(workspaceId, req.params.id, req.body);
      reply.status(201).send();
    },
  );

  // POST /repos/:id/context/files/upload?root_folder=&path= — single .md upload (AC-32/39).
  app.post(
    '/repos/:id/context/files/upload',
    { schema: { params: IdParams, querystring: UploadQuery } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const data = await req.file();
      if (!data) throw new ValidationError('No file in request');
      if (!data.filename.toLowerCase().endsWith(MD_EXT)) {
        throw new ValidationError('Uploaded file must be a .md file');
      }
      const buffer = await readMultipartFile(data);
      await service.uploadFile(workspaceId, req.params.id, req.query.root_folder, req.query.path, buffer.toString('utf8'));
      reply.status(201).send();
    },
  );

  // POST /repos/:id/context/archive?root_folder= — zip extraction (AC-33/34/35/36/39).
  app.post(
    '/repos/:id/context/archive',
    { schema: { params: IdParams, querystring: ArchiveQuery } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const data = await req.file();
      if (!data) throw new ValidationError('No file in request');
      if (!data.filename.toLowerCase().endsWith(ZIP_EXT)) {
        throw new ValidationError('Uploaded file must be a .zip file');
      }
      const buffer = await readMultipartFile(data);
      const result = await service.uploadArchive(workspaceId, req.params.id, req.query.root_folder, buffer);
      reply.status(201).send(result);
    },
  );

  // PUT /repos/:id/context/content — edit, refused on a tracked path (AC-37/38).
  app.put(
    '/repos/:id/context/content',
    { schema: { params: IdParams, body: EditDocBody } },
    async (req): Promise<DocContentResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.editContent(workspaceId, req.params.id, req.body);
    },
  );
}

/**
 * `@fastify/multipart`'s `toBuffer()` throws once the stream has consumed
 * more than the registered `fileSize` limit (`throwFileSizeLimit` defaults to
 * true) — translate that into a stable `ValidationError` (422) rather than
 * letting whatever shape the underlying error has reach the client (AC-39).
 */
async function readMultipartFile(data: { toBuffer(): Promise<Buffer> }): Promise<Buffer> {
  try {
    return await data.toBuffer();
  } catch {
    throw new ValidationError('Uploaded file exceeds the 10 MB limit');
  }
}
