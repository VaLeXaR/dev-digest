import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { OnboardingTour } from '@devdigest/shared';

/**
 * Data access for the `onboarding` table — one JSON blob per repo, PK
 * `repoId` (`server/src/db/schema/context.ts:120-126`). Mirrors the
 * single-row-per-entity upsert pattern used for `pr_brief`
 * (`server/src/modules/reviews/repository/pull.repo.ts:upsertRisks/getRisks`).
 */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async getTour(repoId: string): Promise<OnboardingTour | null> {
    const [row] = await this.db
      .select()
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = OnboardingTour.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async upsertTour(repoId: string, tour: OnboardingTour): Promise<void> {
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt: new Date() })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: tour, generatedAt: new Date() },
      });
  }
}
