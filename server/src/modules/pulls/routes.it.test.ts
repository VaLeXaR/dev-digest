import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockGitHubClient, MockAuthProvider } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';

/**
 * T-07 (grilling G-7) integration coverage: `GET /pulls/:id`'s GitHub-refresh
 * branch now calls `ReviewRepository.replacePrFiles`/`replacePrCommits`
 * (transactional full-replace) instead of an inline non-transactional
 * `container.db.delete(...)` + `insert(...)` pair. This test proves a SECOND
 * refresh with a CHANGED file/commit set fully replaces the prior rows — no
 * duplicates (guarded by the new `pr_files_pr_path_uq`/`pr_commits_pr_sha_uq`
 * unique indexes) and no stale rows left over from a file/commit the "force
 * push" dropped.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = ['pulls-test', seq++].join('-');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: ['acme', name].join('/') })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Test PR',
      author: 'octocat',
      branch: 'feat/x',
      base: 'main',
      headSha: 'sha0',
      status: 'needs_review',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

async function setupWorkspace(db: PgFixture['handle']['db']): Promise<string> {
  const [ws] = await db
    .insert(t.workspaces)
    .values({ name: ['pulls-routes-test', seq++].join('-') })
    .returning();
  return ws!.id;
}

d('GET /pulls/:id — pr_files/pr_commits full replace (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('a second refresh with a changed file/commit set fully replaces the prior rows (no duplicates, no stale rows)', async () => {
    const workspaceId = await setupWorkspace(pg.handle.db);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const auth = new MockAuthProvider(undefined, { id: workspaceId, name: 'pulls-routes-test' });

    // First refresh: files [a.ts, b.ts], commit s1.
    const ghFirst = new MockGitHubClient({
      detail: {
        number: repo ? 1 : 1,
        title: 'Test PR',
        author: 'octocat',
        branch: 'feat/x',
        base: 'main',
        head_sha: 'sha1',
        additions: 3,
        deletions: 0,
        files_count: 2,
        status: 'open',
        body: null,
        files: [
          { path: 'a.ts', additions: 1, deletions: 0, patch: 'patch-a-v1' },
          { path: 'b.ts', additions: 2, deletions: 0, patch: 'patch-b-v1' },
        ],
        commits: [{ sha: 's1', message: 'first commit', author: 'octocat', committed_at: null }],
        linked_issue: null,
      },
    });
    const appFirst = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { auth, github: ghFirst },
    });
    const resFirst = await appFirst.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(resFirst.statusCode).toBe(200);
    await appFirst.close();

    const filesAfterFirst = await pg.handle.db
      .select()
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, pr.id))
      .orderBy(asc(t.prFiles.path));
    expect(filesAfterFirst.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    const commitsAfterFirst = await pg.handle.db
      .select()
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, pr.id));
    expect(commitsAfterFirst.map((c) => c.sha)).toEqual(['s1']);

    // Second refresh: files [b.ts (changed), c.ts (new)] — a.ts dropped by the
    // "force push"; commit s2 replaces s1.
    const ghSecond = new MockGitHubClient({
      detail: {
        number: 1,
        title: 'Test PR',
        author: 'octocat',
        branch: 'feat/x',
        base: 'main',
        head_sha: 'sha2',
        additions: 5,
        deletions: 1,
        files_count: 2,
        status: 'open',
        body: null,
        files: [
          { path: 'b.ts', additions: 4, deletions: 1, patch: 'patch-b-v2' },
          { path: 'c.ts', additions: 1, deletions: 0, patch: 'patch-c-v1' },
        ],
        commits: [{ sha: 's2', message: 'second commit', author: 'octocat', committed_at: null }],
        linked_issue: null,
      },
    });
    const appSecond = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { auth, github: ghSecond },
    });
    const resSecond = await appSecond.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(resSecond.statusCode).toBe(200);
    await appSecond.close();

    const filesAfterSecond = await pg.handle.db
      .select()
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, pr.id))
      .orderBy(asc(t.prFiles.path));
    // Exactly 2 rows — a.ts is gone (dropped, not stale-leaked), no
    // duplicate b.ts row, and b.ts reflects the NEW patch/additions.
    expect(filesAfterSecond).toHaveLength(2);
    expect(filesAfterSecond.map((f) => f.path)).toEqual(['b.ts', 'c.ts']);
    const bFile = filesAfterSecond.find((f) => f.path === 'b.ts');
    expect(bFile?.patch).toBe('patch-b-v2');
    expect(bFile?.additions).toBe(4);

    const commitsAfterSecond = await pg.handle.db
      .select()
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, pr.id));
    // Exactly 1 row — s1 is gone, no duplicate, s2 is the only commit.
    expect(commitsAfterSecond).toHaveLength(1);
    expect(commitsAfterSecond.map((c) => c.sha)).toEqual(['s2']);
  });
});
