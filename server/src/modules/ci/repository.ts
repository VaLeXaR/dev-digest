import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallation, CiRun, CiTarget } from '@devdigest/shared';

/**
 * Data access for `ci_installations` + `ci_runs` — the ONLY layer touching
 * `db/schema`/`drizzle-orm` for the CI domain (onion Infrastructure). Every
 * read is scoped to the caller's workspace via an inner join through
 * `agents` (`ci_installations.agent_id -> agents.id -> agents.workspace_id`)
 * — an id-only lookup would let one workspace read another's CI
 * installations/runs by guessing a uuid (same IDOR class closed for
 * `eval_run_batches`, server INSIGHTS 2026-07-15).
 *
 * Neither `ci_installations` nor `ci_runs` carries a DB-level unique
 * constraint for the natural dedupe keys this domain needs
 * ((agent_id, repo) for installations; (ci_installation_id, github_url) for
 * runs) — both `upsert*` methods below do an explicit select-then-write
 * instead of `onConflictDoUpdate` (which requires a real unique index).
 */

export interface UpsertInstallationInput {
  agentId: string;
  repo: string;
  targetType: CiTarget;
}

export interface UpsertRunInput {
  ciInstallationId: string;
  prNumber: number | null;
  /** ISO timestamp, or null when the run's start time couldn't be resolved. */
  ranAt: string | null;
  status: string;
  findingsCount: number | null;
  costUsd: number | null;
  githubUrl: string;
  /** CI target badge (currently always the installation's `target_type`). */
  source: string;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  prTitle: string | null;
}

/** Lightweight projection used by the pull-based ingest loop (no DTO join needed). */
export interface InstallationForIngest {
  id: string;
  repo: string;
  targetType: CiTarget;
}

type InstallationRow = typeof t.ciInstallations.$inferSelect;
type RunRow = typeof t.ciRuns.$inferSelect;

function toInstallationDto(row: InstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType as CiTarget,
    installed_at: row.installedAt.toISOString(),
  };
}

/**
 * `agent` is NOT a stored column on `ci_runs` (the table predates T-02 and
 * only carries `critical`/`warning`/`suggestion`/`pr_title` as additive
 * fields, per T-01) — it is resolved at read time from the joined
 * `agents.name`, never persisted at ingest. Same reasoning applies to
 * `duration_s`: there is no `duration` column in this schema, so it is always
 * `undefined` here; the contract field is `.nullish()` specifically so a
 * row that never had it stays valid.
 */
function toRunDto(row: RunRow, agentName: string | null): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    pr_number: row.prNumber,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    status: row.status,
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: agentName,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    pr_title: row.prTitle,
  };
}

export class CiRepository {
  constructor(private db: Db) {}

  // ---- ci_installations -----------------------------------------------------

  async findInstallation(agentId: string, repo: string): Promise<InstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));
    return row;
  }

  /** Insert-or-refresh the single installation row for (agentId, repo) (AC-17/18/44). */
  async upsertInstallation(input: UpsertInstallationInput): Promise<CiInstallation> {
    const existing = await this.findInstallation(input.agentId, input.repo);
    if (existing) {
      const [row] = await this.db
        .update(t.ciInstallations)
        .set({ targetType: input.targetType })
        .where(eq(t.ciInstallations.id, existing.id))
        .returning();
      return toInstallationDto(row!);
    }
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ agentId: input.agentId, repo: input.repo, targetType: input.targetType })
      .returning();
    return toInstallationDto(row!);
  }

  /** Installations for one agent, workspace-scoped. */
  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)));
    return rows.map((r) => toInstallationDto(r.installation));
  }

  /** Every installation in the workspace — the ingest loop's fan-out list. */
  async listInstallationsForWorkspace(workspaceId: string): Promise<InstallationForIngest[]> {
    const rows = await this.db
      .select({
        id: t.ciInstallations.id,
        repo: t.ciInstallations.repo,
        targetType: t.ciInstallations.targetType,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows.map((r) => ({ id: r.id, repo: r.repo, targetType: r.targetType as CiTarget }));
  }

  // ---- ci_runs ---------------------------------------------------------------

  async findRunByGithubUrl(ciInstallationId: string, githubUrl: string): Promise<RunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.ciInstallationId, ciInstallationId), eq(t.ciRuns.githubUrl, githubUrl)),
      );
    return row;
  }

  /** Insert-or-refresh one ingested run, keyed by (installation, github_url). */
  async upsertRun(input: UpsertRunInput): Promise<void> {
    const existing = await this.findRunByGithubUrl(input.ciInstallationId, input.githubUrl);
    const values = {
      ciInstallationId: input.ciInstallationId,
      prNumber: input.prNumber,
      ranAt: input.ranAt ? new Date(input.ranAt) : null,
      status: input.status,
      findingsCount: input.findingsCount,
      costUsd: input.costUsd,
      githubUrl: input.githubUrl,
      source: input.source,
      critical: input.critical,
      warning: input.warning,
      suggestion: input.suggestion,
      prTitle: input.prTitle,
    };
    if (existing) {
      await this.db.update(t.ciRuns).set(values).where(eq(t.ciRuns.id, existing.id));
      return;
    }
    await this.db.insert(t.ciRuns).values(values);
  }

  /** Every run in the workspace, newest first — `GET /ci-runs` (AC-24…AC-28). */
  async listRunsForWorkspace(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.db
      .select({ run: t.ciRuns, agentName: t.agents.name })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(desc(t.ciRuns.ranAt));
    return rows.map((r) => toRunDto(r.run, r.agentName));
  }
}
