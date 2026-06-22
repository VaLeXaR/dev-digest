import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

export type { ConventionRow };

/**
 * Conventions repository — data-access layer for the Conventions Extractor feature.
 * Handles CRUD operations on the `conventions` table, workspace-scoped throughout.
 */
export class ConventionsRepository {
  constructor(private db: Db) {}

  /**
   * Delete all conventions for a repo before re-scan.
   * Workspace-scoped to prevent cross-workspace data leaks.
   */
  async deleteAllForRepo(repoId: string, workspaceId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.workspaceId, workspaceId),
        ),
      );
  }

  /**
   * Batch insert conventions after LLM extraction + verification.
   * Returns the inserted rows mapped to ConventionCandidate type (snake_case).
   */
  async insertMany(
    workspaceId: string,
    repoId: string,
    candidates: Array<{
      rule: string;
      evidencePath: string;
      evidenceSnippet: string;
      confidence: number;
    }>,
  ): Promise<ConventionCandidate[]> {
    if (candidates.length === 0) return [];

    const rows = await this.db
      .insert(t.conventions)
      .values(
        candidates.map((c) => ({
          workspaceId,
          repoId,
          rule: c.rule,
          evidencePath: c.evidencePath,
          evidenceSnippet: c.evidenceSnippet,
          confidence: c.confidence,
          accepted: false,
        })),
      )
      .returning();

    return rows.map((row) => this.mapRowToCandidate(row));
  }

  /**
   * Fetch all conventions for a repo, ordered by confidence descending.
   * Workspace-scoped to prevent cross-workspace data leaks.
   */
  async listForRepo(repoId: string, workspaceId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(t.conventions.confidence));

    return rows.map((row) => this.mapRowToCandidate(row));
  }

  /**
   * Update a convention's rule text or accepted flag.
   * Workspace-scoped to prevent cross-workspace data leaks.
   */
  async updateOne(
    id: string,
    workspaceId: string,
    patch: { rule?: string; accepted?: boolean },
  ): Promise<ConventionCandidate> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(
        and(
          eq(t.conventions.id, id),
          eq(t.conventions.workspaceId, workspaceId),
        ),
      )
      .returning();

    return this.mapRowToCandidate(row!);
  }

  /**
   * Map Drizzle row (camelCase) to ConventionCandidate (snake_case).
   * Drizzle returns: evidencePath, evidenceSnippet
   * ConventionCandidate expects: evidence_path, evidence_snippet
   */
  private mapRowToCandidate(
    row: typeof t.conventions.$inferSelect,
  ): ConventionCandidate {
    return {
      id: row.id,
      rule: row.rule,
      evidence_path: row.evidencePath ?? '',
      evidence_snippet: row.evidenceSnippet ?? '',
      confidence: row.confidence ?? 0,
      accepted: row.accepted,
    };
  }
}
