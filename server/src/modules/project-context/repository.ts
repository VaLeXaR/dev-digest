import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Per-path usage aggregate — "used by N agents" (D-UBA) + coverage flag (T-02, D-COV). */
export interface UsageInfo {
  agentCount: number;
  coveredByAny: boolean;
}

/**
 * Read-only aggregate over the attach link tables (`agent_context_docs`,
 * `skill_context_docs` joined to `skills`/`agent_skills`/`agents`) for the
 * "Used by N agents" pill (D-UBA) and the repo-level coverage flag (D-COV,
 * wired by T-02). Reads three link tables from within this module without
 * importing the agents/skills *services* — the established cross-module
 * data-access pattern for this codebase (plan `## Architecture notes`).
 *
 * Computed fresh on every call — never folded into the filesystem-walk
 * discovery cache (D-FRESH); callers must re-invoke this per request.
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  /**
   * `used_by_agents = |A ∪ B|` per path (D-UBA), where:
   *  - A = agents in `workspaceId` with a row in `agent_context_docs` for the
   *    path (direct attach; agent's own `enabled` flag is irrelevant — a
   *    disabled agent still *references* the doc in its config).
   *  - B = agents in `workspaceId` linked via an *enabled* `agent_skills` row
   *    to an *enabled* skill that has a row in `skill_context_docs` for the
   *    path (inherited attach) — mirrors the run-executor's actual
   *    inheritance filter (`l.enabled && l.skill.enabled`).
   * `coveredByAny` is true for any path referenced by ≥1 `agent_context_docs`
   * OR ≥1 `skill_context_docs` row in the workspace, regardless of the
   * enabled-link/enabled-skill condition above (T-02's coverage signal).
   * Only aggregates over the passed `paths` — never scans the full tables.
   */
  async usageCounts(workspaceId: string, paths: string[]): Promise<Map<string, UsageInfo>> {
    const map = new Map<string, UsageInfo>();
    if (paths.length === 0) return map;

    const agentIdsByPath = new Map<string, Set<string>>();
    const addAgent = (path: string, agentId: string): void => {
      const set = agentIdsByPath.get(path) ?? new Set<string>();
      set.add(agentId);
      agentIdsByPath.set(path, set);
    };
    const coveredPaths = new Set<string>();

    // (a) direct attach: agent_context_docs -> agents (workspace-scoped)
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agentContextDocs.path, paths)));
    for (const row of direct) {
      addAgent(row.path, row.agentId);
      coveredPaths.add(row.path);
    }

    // Coverage side of skill attaches — any skill_context_docs row counts,
    // regardless of the skill/link enabled state (unlike the agentCount side
    // below, which requires both to be enabled).
    const skillDocs = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skillContextDocs.path, paths)));
    for (const row of skillDocs) {
      coveredPaths.add(row.path);
    }

    // (b) inherited attach: skill_context_docs -> skills (enabled) -> agent_skills (enabled link) -> agents
    const inherited = await this.db
      .select({ path: t.skillContextDocs.path, agentId: t.agents.id })
      .from(t.skillContextDocs)
      .innerJoin(
        t.skills,
        and(eq(t.skillContextDocs.skillId, t.skills.id), eq(t.skills.enabled, true)),
      )
      .innerJoin(
        t.agentSkills,
        and(eq(t.agentSkills.skillId, t.skills.id), eq(t.agentSkills.enabled, true)),
      )
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
          inArray(t.skillContextDocs.path, paths),
        ),
      );
    for (const row of inherited) {
      addAgent(row.path, row.agentId);
    }

    const allPaths = new Set<string>([...agentIdsByPath.keys(), ...coveredPaths]);
    for (const path of allPaths) {
      map.set(path, {
        agentCount: agentIdsByPath.get(path)?.size ?? 0,
        coveredByAny: coveredPaths.has(path),
      });
    }

    return map;
  }
}
