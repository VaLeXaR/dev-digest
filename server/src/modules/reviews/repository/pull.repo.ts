import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import { Risks, WhyRiskBrief } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}

// ---- risks ----------------------------------------------------------------

export async function upsertRisks(db: Db, prId: string, risks: Risks): Promise<void> {
  await db
    .insert(t.prBrief)
    .values({ prId, json: risks })
    .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: risks } });
}

export async function getRisks(db: Db, prId: string): Promise<Risks | undefined> {
  const row = await db
    .select()
    .from(t.prBrief)
    .where(eq(t.prBrief.prId, prId))
    .then((rows) => rows[0]);
  if (!row) return undefined;
  const parsed = Risks.safeParse(row.json);
  return parsed.success ? parsed.data : undefined;
}

// ---- why+risk brief ---------------------------------------------------------

export async function upsertWhyRiskBrief(
  db: Db,
  prId: string,
  brief: WhyRiskBrief,
): Promise<void> {
  await db
    .insert(t.prWhyRiskBrief)
    .values({ prId, json: brief })
    .onConflictDoUpdate({ target: t.prWhyRiskBrief.prId, set: { json: brief } });
}

export async function getWhyRiskBrief(db: Db, prId: string): Promise<WhyRiskBrief | undefined> {
  const row = await db
    .select()
    .from(t.prWhyRiskBrief)
    .where(eq(t.prWhyRiskBrief.prId, prId))
    .then((rows) => rows[0]);
  if (!row) return undefined;
  const parsed = WhyRiskBrief.safeParse(row.json);
  return parsed.success ? parsed.data : undefined;
}

// ---- blast summary ---------------------------------------------------------

export async function upsertBlastSummary(db: Db, prId: string, summary: string): Promise<void> {
  await db
    .insert(t.prBlastSummary)
    .values({ prId, summary, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: t.prBlastSummary.prId,
      set: { summary, generatedAt: new Date() },
    });
}

export async function getBlastSummary(
  db: Db,
  prId: string,
): Promise<{ summary: string; generatedAt: Date } | undefined> {
  const [row] = await db
    .select()
    .from(t.prBlastSummary)
    .where(eq(t.prBlastSummary.prId, prId));
  if (!row) return undefined;
  return { summary: row.summary, generatedAt: row.generatedAt };
}
