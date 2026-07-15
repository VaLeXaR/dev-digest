import { and, asc, count, countDistinct, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillAgent, SkillType, SkillSource } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION, DEFAULT_SKILL_DESCRIPTION } from './constants.js';
import { isSkillConfigChange } from './helpers.js';

export interface SkillStats {
  agentCount: number;
  pullPct: number | null;
  acceptPct: number | null;
}

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_SKILL_DESCRIPTION,
        type: values.type,
        source: values.source,
        body: values.body,
        version: INITIAL_SKILL_VERSION,
        enabled: true,
      })
      .returning();
    await this.snapshotVersion(row!.id, INITIAL_SKILL_VERSION, values.body);
    return row!;
  }

  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const configChanged = isSkillConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row.id, nextVersion, row.body);
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getAgentsBySkill(skillId: string): Promise<SkillAgent[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }

  async statsForSkills(skillIds: string[]): Promise<Map<string, SkillStats>> {
    const result = new Map<string, SkillStats>();
    if (skillIds.length === 0) return result;
    const ids = skillIds as [string, ...string[]];

    // Agent count per skill
    const agentRows = await this.db
      .select({ skillId: t.agentSkills.skillId, cnt: countDistinct(t.agentSkills.agentId) })
      .from(t.agentSkills)
      .where(inArray(t.agentSkills.skillId, ids))
      .groupBy(t.agentSkills.skillId);
    const agentCounts = new Map(agentRows.map((r) => [r.skillId, r.cnt]));

    // Total distinct PRs reviewed (denominator for pull_pct)
    const [totalPrRow] = await this.db
      .select({ cnt: countDistinct(t.reviews.prId) })
      .from(t.reviews)
      .where(eq(t.reviews.kind, 'review'));
    const totalPrs = totalPrRow?.cnt ?? 0;

    // PRs reviewed per skill (via agent_skills → reviews)
    const pullRows = await this.db
      .select({ skillId: t.agentSkills.skillId, cnt: countDistinct(t.reviews.prId) })
      .from(t.agentSkills)
      .innerJoin(t.reviews, eq(t.reviews.agentId, t.agentSkills.agentId))
      .where(and(inArray(t.agentSkills.skillId, ids), eq(t.reviews.kind, 'review')))
      .groupBy(t.agentSkills.skillId);
    const pullCounts = new Map(pullRows.map((r) => [r.skillId, r.cnt]));

    // Accepted / total findings per skill (via agent_skills → reviews → findings)
    // count(column) ignores NULLs, so count(acceptedAt) = accepted count
    const findingRows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        total: count(t.findings.id),
        accepted: count(t.findings.acceptedAt),
      })
      .from(t.agentSkills)
      .innerJoin(t.reviews, and(eq(t.reviews.agentId, t.agentSkills.agentId), eq(t.reviews.kind, 'review')))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.agentSkills.skillId, ids))
      .groupBy(t.agentSkills.skillId);
    const findingStats = new Map(findingRows.map((r) => [r.skillId, r]));

    for (const id of skillIds) {
      const ac = agentCounts.get(id) ?? 0;
      const pc = pullCounts.get(id) ?? 0;
      const fs = findingStats.get(id);
      result.set(id, {
        agentCount: ac,
        pullPct: totalPrs > 0 ? Math.round((pc / totalPrs) * 100) : null,
        acceptPct: fs && fs.total > 0 ? Math.round((fs.accepted / fs.total) * 100) : null,
      });
    }
    return result;
  }

  /**
   * Replace the full set of attached context-doc paths for a skill (D1:
   * delete-then-bulk-insert, `order` = array index). Per D2 this ALWAYS bumps
   * `version` + snapshots `skill_versions` — unlike `setSkills`-style link
   * writes elsewhere, attached paths shape the skill's serialized context, so
   * every write must be reproducible from a version snapshot. Returns
   * undefined if no such skill exists.
   */
  async setContextDocs(skillId: string, paths: string[]): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, order) => ({ skillId, path, order })));
      }

      const [existing] = await tx.select().from(t.skills).where(eq(t.skills.id, skillId));
      if (!existing) return undefined;

      const nextVersion = existing.version + 1;
      const [row] = await tx
        .update(t.skills)
        .set({ version: nextVersion })
        .where(eq(t.skills.id, skillId))
        .returning();

      if (row) await this.snapshotVersion(row.id, nextVersion, row.body);
      return row;
    });
  }

  /** Attached context-doc paths for a skill, in `order` ascending. */
  async contextDocPaths(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  private async snapshotVersion(skillId: string, version: number, body: string): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId, version, body })
      .onConflictDoNothing();
  }
}
