import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockAuthProvider, MockGitClient, type MockGitOptions } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';

/**
 * Integration test for the project-context routes (real Postgres via
 * testcontainers, real filesystem writes under a per-test temp clone dir).
 * `tracked` status is driven entirely by `MockGitClient`'s `trackedFiles`
 * option — no real git repo is needed for any of these cases.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const cleanupDirs: string[] = [];
function tempCloneDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-routes-'));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function buildMultipartBody(
  boundary: string,
  filename: string,
  content: Buffer,
  contentType: string,
): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, content, tail]);
}

function injectMultipart(
  app: FastifyInstance,
  url: string,
  filename: string,
  content: Buffer,
  contentType = 'text/markdown',
) {
  const boundary = '----projectContextTestBoundary';
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: buildMultipartBody(boundary, filename, content, contentType),
  });
}

d('project-context routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let wsSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(
    gitOpts: MockGitOptions = {},
  ): Promise<{ app: FastifyInstance; repoId: string; clonePath: string; workspaceId: string }> {
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: ['project-context-test', wsSeq++].join('-') })
      .returning();
    const workspaceId = ws!.id;

    const clonePath = tempCloneDir();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'widgets',
        fullName: 'acme/widgets',
        clonePath,
      })
      .returning();

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'project-context-test' }),
        git: new MockGitClient(gitOpts),
      },
    });

    return { app, repoId: repo!.id, clonePath, workspaceId };
  }

  it('GET /repos/:id/context/docs returns discovery shape with tracked flags', async () => {
    const { app, repoId, clonePath } = await setup({ trackedFiles: ['specs/tracked.md'] });
    writeFile(clonePath, 'specs/tracked.md', 'tracked content'); // 16 bytes
    writeFile(clonePath, 'docs/untracked.md', 'untracked'); // 9 bytes

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.file_count).toBe(2);
    expect(body.token_budget).toBe(4000);
    expect(typeof body.scanned_at).toBe('string');
    const byPath = new Map(body.documents.map((doc: { path: string }) => [doc.path, doc]));
    expect(byPath.get('specs/tracked.md')).toMatchObject({ tracked: true, root_folder: 'specs' });
    expect(byPath.get('docs/untracked.md')).toMatchObject({ tracked: false, root_folder: 'docs' });
    expect(body.token_total).toBe(
      Math.ceil(16 / 4) + Math.ceil(9 / 4),
    );

    await app.close();
  });

  it('rejects a repo belonging to a different workspace with 404 (workspace isolation / IDOR)', async () => {
    const owner = await setup({ trackedFiles: [] });
    writeFile(owner.clonePath, 'specs/secret.md', 'workspace-B-only content');
    const intruder = await setup();

    // `intruder.app`'s auth context is scoped to a DIFFERENT, freshly-created
    // workspace — it must not be able to read or write `owner`'s repo just by
    // guessing/reusing its repoId.
    const read = await intruder.app.inject({
      method: 'GET',
      url: `/repos/${owner.repoId}/context/docs`,
    });
    expect(read.statusCode).toBe(404);

    const write = await intruder.app.inject({
      method: 'POST',
      url: `/repos/${owner.repoId}/context/files`,
      payload: { root_folder: 'specs', path: 'intruder.md', content: 'should never land' },
    });
    expect(write.statusCode).toBe(404);
    expect(fs.existsSync(path.join(owner.clonePath, 'specs', 'intruder.md'))).toBe(false);

    await owner.app.close();
    await intruder.app.close();
  });

  it('POST /repos/:id/context/refresh re-scans and picks up new files', async () => {
    const { app, repoId, clonePath } = await setup();
    writeFile(clonePath, 'specs/one.md', 'one');

    const first = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
    expect(first.json().file_count).toBe(1);

    writeFile(clonePath, 'specs/two.md', 'two');
    const cachedAgain = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
    expect(cachedAgain.json().file_count).toBe(1); // still cached, refresh not called yet

    const refreshed = await app.inject({ method: 'POST', url: `/repos/${repoId}/context/refresh` });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().file_count).toBe(2);

    await app.close();
  });

  it('POST /repos/:id/context/folders creates a folder under a root folder', async () => {
    const { app, repoId, clonePath } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/folders`,
      payload: { root_folder: 'specs', path: 'new-area' },
    });

    expect(res.statusCode).toBe(201);
    expect(fs.existsSync(path.join(clonePath, 'specs', 'new-area'))).toBe(true);

    await app.close();
  });

  it('POST /repos/:id/context/files creates a file with inline content', async () => {
    const { app, repoId, clonePath } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/files`,
      payload: { root_folder: 'docs', path: 'new-doc.md', content: '# Hello' },
    });

    expect(res.statusCode).toBe(201);
    expect(fs.readFileSync(path.join(clonePath, 'docs', 'new-doc.md'), 'utf8')).toBe('# Hello');

    await app.close();
  });

  it('POST /repos/:id/context/files rejects a path-conflict with 409', async () => {
    const { app, repoId } = await setup();

    const first = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/files`,
      payload: { root_folder: 'docs', path: 'dup.md', content: 'first' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/files`,
      payload: { root_folder: 'docs', path: 'dup.md', content: 'second' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('conflict');

    await app.close();
  });

  it('POST /repos/:id/context/archive extracts nested .md entries, ignores non-.md, rejects zip-slip', async () => {
    const { app, repoId, clonePath } = await setup();

    const zipBuffer = Buffer.from(
      zipSync({
        'nested/deep/a.md': strToU8('# A'),
        'ignored.txt': strToU8('should be ignored'),
        '../escape.md': strToU8('should be rejected'),
      }),
    );

    const res = await injectMultipart(
      app,
      `/repos/${repoId}/context/archive?root_folder=specs`,
      'bundle.zip',
      zipBuffer,
      'application/zip',
    );

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.written).toEqual(['nested/deep/a.md']);
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'nested', 'deep', 'a.md'), 'utf8')).toBe('# A');
    expect(fs.existsSync(path.join(clonePath, 'specs', 'ignored.txt'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(clonePath), 'escape.md'))).toBe(false);

    await app.close();
  });

  it('PUT /repos/:id/context/content succeeds on an untracked path and is refused on a tracked one', async () => {
    const { app, repoId, clonePath } = await setup({ trackedFiles: ['specs/tracked.md'] });
    writeFile(clonePath, 'specs/untracked.md', 'old');
    writeFile(clonePath, 'specs/tracked.md', 'old tracked');

    const okEdit = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/content`,
      payload: { path: 'specs/untracked.md', content: 'new' },
    });
    expect(okEdit.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'untracked.md'), 'utf8')).toBe('new');

    const refusedEdit = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/content`,
      payload: { path: 'specs/tracked.md', content: 'new tracked' },
    });
    expect(refusedEdit.statusCode).toBe(409);
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'tracked.md'), 'utf8')).toBe('old tracked');

    await app.close();
  });

  it('PUT /repos/:id/context/content rejects a path outside the configured root folders, writing nothing', async () => {
    const { app, repoId, clonePath } = await setup();
    writeFile(clonePath, 'README.md', 'untouched');

    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/content`,
      payload: { path: 'README.md', content: 'malicious overwrite' },
    });

    expect(res.statusCode).toBe(422);
    expect(fs.readFileSync(path.join(clonePath, 'README.md'), 'utf8')).toBe('untouched');

    await app.close();
  });

  it('PUT /repos/:id/context/content rejects a ".."-crafted path that would otherwise escape the root folder, writing nothing', async () => {
    const { app, repoId, clonePath } = await setup();
    writeFile(clonePath, 'README.md', 'untouched');
    fs.mkdirSync(path.join(clonePath, 'specs'), { recursive: true });

    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/content`,
      payload: { path: 'specs/../README.md', content: 'malicious overwrite' },
    });

    expect(res.statusCode).toBe(422);
    expect(fs.readFileSync(path.join(clonePath, 'README.md'), 'utf8')).toBe('untouched');

    await app.close();
  });

  it('PUT /repos/:id/context/content refuses a ".."-crafted path resolving to a tracked file, writing nothing', async () => {
    const { app, repoId, clonePath } = await setup({ trackedFiles: ['README.md'] });
    writeFile(clonePath, 'README.md', 'untouched tracked');
    fs.mkdirSync(path.join(clonePath, 'specs'), { recursive: true });

    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/content`,
      payload: { path: 'specs/../README.md', content: 'malicious overwrite' },
    });

    // Rejected either by the root-folder scope check (422) or the tracked-file
    // gate (409) — both are acceptable outcomes; what matters is nothing writes.
    expect([409, 422]).toContain(res.statusCode);
    expect(fs.readFileSync(path.join(clonePath, 'README.md'), 'utf8')).toBe('untouched tracked');

    await app.close();
  });

  it('POST /repos/:id/context/folders rejects a ".."-crafted path escaping the target root folder into a sibling directory, writing nothing', async () => {
    const { app, repoId, clonePath } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/folders`,
      payload: { root_folder: 'specs', path: '../docs/escaped' },
    });

    expect(res.statusCode).toBe(422);
    expect(fs.existsSync(path.join(clonePath, 'docs', 'escaped'))).toBe(false);

    await app.close();
  });

  it('POST /repos/:id/context/files/upload rejects a file over the 10 MB limit, writing nothing', async () => {
    const { app, repoId, clonePath } = await setup();
    const oversize = Buffer.alloc(11 * 1024 * 1024, 'a');

    const res = await injectMultipart(
      app,
      `/repos/${repoId}/context/files/upload?root_folder=specs&path=big.md`,
      'big.md',
      oversize,
    );

    expect(res.statusCode).toBe(422);
    expect(fs.existsSync(path.join(clonePath, 'specs', 'big.md'))).toBe(false);

    await app.close();
  });
});
