import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import * as t from '../../db/schema.js';
import { ReviewRepository } from './repository.js';
import type { WhyRiskBrief } from '@devdigest/shared';

/**
 * DB-backed round-trip test for `ReviewRepository.upsertWhyRiskBrief` /
 * `getWhyRiskBrief` (T-04 of why-risk-brief.md). Mirrors
 * `agents/repository.it.test.ts` — direct workspace/repo/PR row setup, no
 * app/routes, since this is a pure repository-layer concern.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const brief: WhyRiskBrief = {
  what: 'Adds rate limiting to the payments API',
  why: 'Prevents abuse from a single caller flooding /charge',
  risk_level: 'medium',
  risks: [
    {
      kind: 'behavior',
      title: 'Rate limiter may reject legitimate bursts',
      explanation: 'Fixed window can reject valid retries',
      severity: 'medium',
      file_refs: ['src/middleware/rateLimit.ts'],
    },
  ],
  review_focus: [{ file: 'src/middleware/rateLimit.ts', line: 12, reason: 'window size hardcoded' }],
};

d('ReviewRepository.upsertWhyRiskBrief / getWhyRiskBrief', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    repo = new ReviewRepository(pg.handle.db);
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'why-risk-brief-test' })
      .returning();
    workspaceId = ws!.id;
  }, 60_000);

  afterAll(() => pg?.stop());

  async function makePr() {
    const name = ['why-risk-brief-repo', repoSeq++].join('-');
    const [repoRow] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: ['acme', name].join('/') })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repoRow!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
      })
      .returning();
    return pr!;
  }

  it('round-trips a brief through upsert then get', async () => {
    const pr = await makePr();

    await repo.upsertWhyRiskBrief(pr.id, brief);
    const got = await repo.getWhyRiskBrief(pr.id);

    expect(got).toEqual(brief);
  });

  it('upsert on the same pr overwrites in place (keyed by pr_id)', async () => {
    const pr = await makePr();
    await repo.upsertWhyRiskBrief(pr.id, brief);

    const updated: WhyRiskBrief = { ...brief, what: 'Updated summary', risk_level: 'high' };
    await repo.upsertWhyRiskBrief(pr.id, updated);

    const got = await repo.getWhyRiskBrief(pr.id);
    expect(got).toEqual(updated);

    const rows = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    expect(rows).toHaveLength(1);
  });

  it('returns undefined for a pr with no persisted brief', async () => {
    const pr = await makePr();
    const got = await repo.getWhyRiskBrief(pr.id);
    expect(got).toBeUndefined();
  });
});
