import type { Container } from '../../platform/container.js';
import type {
  EvalCase,
  EvalCaseFromFindingInput,
  EvalCaseInput,
  EvalDashboard,
  EvalDashboardOverview,
  EvalRunBatchRecord,
  EvalRunBatchResult,
  EvalRunRecord,
  EvalTrendPoint,
  ExpectedFinding,
  Provider,
} from '@devdigest/shared';
import { reviewPullRequest, scoreEvalCase } from '@devdigest/reviewer-core';
import type { LLMProvider } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { diffFromPrFiles } from '../reviews/diff-loader.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { EvalRepository, type EvalCaseUpdate } from './repository.js';
import { aggregateBatch, buildRegressionAlert, type CaseRunResult } from './helpers.js';

/**
 * A5 — eval run orchestration, create-from-finding, dashboard assembly.
 *
 * Mirrors `run-executor.ts:runOneAgent`'s DIRECT LLM invocation (agent.model +
 * agent.provider, resolved linked skills) — NOT the fire-and-forget
 * `runReview`, which persists to reviews/findings + streams SSE. Every run
 * here persists ONLY to `eval_runs` / `eval_run_batches` via `EvalRepository`.
 * Reuses `reviewPullRequest` (which internally calls `assemblePrompt`) so the
 * AC-17 INJECTION_GUARD wraps the snapshotted diff automatically — never
 * build a bespoke prompt path here.
 */
export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  // ---- run orchestration ---------------------------------------------------

  /**
   * "Run all evals" — runs the agent over every case in its set as ONE batch.
   * AC-18: each case is isolated (see `executeCase`) — a per-case failure
   * never aborts the remaining cases. Writes exactly one `eval_run_batches`
   * row (R7, carrying the agent's CURRENT version) plus one `eval_runs` row
   * per case, linked via `batchId`.
   */
  async runSet(workspaceId: string, agentId: string): Promise<EvalRunBatchResult> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.repo.listCasesForAgent(workspaceId, agentId);
    const llm = await this.container.llm(agent.provider as Provider);
    const skills = await this.resolveSkills(agent.id);

    const results: CaseRunResult[] = [];
    for (const evalCase of cases) {
      results.push(await this.executeCase(agent, llm, skills, evalCase));
    }

    const aggregate = aggregateBatch(results);
    const batch = await this.repo.insertBatch({
      agentId: agent.id,
      agentVersion: agent.version,
      recall: aggregate.recall,
      precision: aggregate.precision,
      citationAccuracy: aggregate.citation_accuracy,
      passCount: aggregate.passCount,
      totalCount: results.length,
      costUsd: aggregate.costUsd,
    });

    for (const r of results) {
      await this.repo.insertEvalRun({
        caseId: r.caseId,
        batchId: batch.id,
        pass: r.pass,
        recall: r.recall,
        precision: r.precision,
        citationAccuracy: r.citation_accuracy,
        actualOutput: r.actualOutput,
        durationMs: r.durationMs,
        costUsd: r.costUsd,
      });
    }

    return batch;
  }

  /**
   * Single-case run (editor "Run case" / "Run on save", Evals-tab per-case
   * ▷). G7: a scratch run — persists an `eval_runs` row with `batchId = NULL`
   * and creates NO `eval_run_batches` row, so it never affects history /
   * dashboard / Compare.
   */
  async runCase(workspaceId: string, caseId: string): Promise<EvalRunRecord> {
    const evalCase = await this.repo.getCase(workspaceId, caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');
    if (evalCase.owner_kind !== 'agent') {
      throw new AppError(
        'unsupported_case_owner',
        'Only agent-owned eval cases can be run in this version.',
        400,
      );
    }

    const agent = await this.container.agentsRepo.getById(workspaceId, evalCase.owner_id);
    if (!agent) throw new NotFoundError('Owning agent not found');

    const llm = await this.container.llm(agent.provider as Provider);
    const skills = await this.resolveSkills(agent.id);
    const result = await this.executeCase(agent, llm, skills, evalCase);

    return this.repo.insertEvalRun({
      caseId: result.caseId,
      batchId: null,
      pass: result.pass,
      recall: result.recall,
      precision: result.precision,
      citationAccuracy: result.citation_accuracy,
      actualOutput: result.actualOutput,
      durationMs: result.durationMs,
      costUsd: result.costUsd,
    });
  }

  /**
   * Execute one case against a resolved agent: parse `input_diff` ONCE, run
   * the shared review engine, reconstruct the RAW pre-grounding finding set
   * (AC-10: `outcome.review.findings ∪ outcome.dropped.map(d => d.finding)`),
   * then score it. AC-18: any thrown error (LLM failure, provider error) is
   * caught HERE so the caller's loop always continues to the next case.
   */
  private async executeCase(
    agent: AgentRow,
    llm: LLMProvider,
    skills: string[],
    evalCase: EvalCase,
  ): Promise<CaseRunResult> {
    const start = Date.now();
    try {
      const diff = parseUnifiedDiff(evalCase.input_diff);
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        strategy: agent.strategy ?? undefined,
        ...(skills.length > 0 ? { skills } : {}),
      });
      const raw = [...outcome.review.findings, ...outcome.dropped.map((d) => d.finding)];
      const score = scoreEvalCase(evalCase.expected_output, raw, diff);
      return {
        caseId: evalCase.id,
        pass: score.pass,
        recall: score.recall,
        precision: score.precision,
        citation_accuracy: score.citation_accuracy,
        actualOutput: raw,
        durationMs: Date.now() - start,
        costUsd: outcome.costUsd,
      };
    } catch (err) {
      return {
        caseId: evalCase.id,
        pass: false,
        recall: null,
        precision: null,
        citation_accuracy: null,
        actualOutput: { error: (err as Error).message },
        durationMs: Date.now() - start,
        costUsd: null,
      };
    }
  }

  /** Batch history for an agent (T-07 `GET /agents/:id/eval-batches`) — workspace-scoped via the repo's `agents.workspaceId` join. */
  listBatches(workspaceId: string, agentId: string): Promise<EvalRunBatchRecord[]> {
    return this.repo.listBatchesForAgent(workspaceId, agentId);
  }

  /**
   * Per-case latest run for every case owned by an agent (batch OR scratch,
   * G7/R2 AC-4) — powers the Evals-tab per-case status, unlike
   * `agentDashboard().recent_runs` which is scoped to the latest BATCH only.
   */
  lastRunsForAgent(workspaceId: string, agentId: string): Promise<EvalRunRecord[]> {
    return this.repo.lastRunsForAgentCases(workspaceId, agentId);
  }

  /**
   * Per-case drill-down for one set-run batch (T-07 `GET /eval-batches/:id/runs`).
   * `runsForBatch` is already workspace-scoped (joins through `agents.workspaceId`,
   * server INSIGHTS 2026-07-15) so a cross-workspace batchId can never leak rows —
   * but we still resolve the batch via `getBatch` first so a mismatched/unknown
   * batch 404s the same way every other not-found case in this service does,
   * rather than silently returning an empty array.
   */
  async batchRuns(workspaceId: string, batchId: string): Promise<EvalRunRecord[]> {
    const batch = await this.repo.getBatch(workspaceId, batchId);
    if (!batch) throw new NotFoundError('Eval batch not found');
    return this.repo.runsForBatch(workspaceId, batchId);
  }

  /** Resolved enabled linked-skill bodies, mirroring `run-executor.ts:runOneAgent`. */
  private async resolveSkills(agentId: string): Promise<string[]> {
    const links = await this.container.agentsRepo.linkedSkills(agentId);
    return links
      .filter((l) => l.enabled && l.skill.enabled)
      .map((l) => `### ${l.skill.name}\n${l.skill.body}`);
  }

  // ---- create from finding (R1/AC-1/AC-2/AC-3/AC-26) -----------------------

  /**
   * G6: input is `{ finding_id }` ONLY — the owner agent is resolved
   * SERVER-SIDE from the finding's own review. G4: snapshots the WHOLE PR
   * unified diff (pure-DB reconstruction from `pr_files` patches, no live
   * git) so the case replays deterministically forever, independent of the
   * live clone. AC-26: always creates a NEW case, never updates an existing
   * one for the same finding.
   */
  async createCaseFromFinding(
    workspaceId: string,
    input: EvalCaseFromFindingInput,
  ): Promise<EvalCase> {
    const ctx = await this.container.reviewRepo.findingContext(input.finding_id);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    if (!review.agentId) {
      throw new AppError(
        'no_owning_agent',
        'This review has no owning agent (summary or legacy review) so no eval case can be created from it.',
        400,
      );
    }
    if (!finding.acceptedAt && !finding.dismissedAt) {
      throw new ValidationError('Finding must be accepted or dismissed first');
    }

    const type: ExpectedFinding['type'] = finding.acceptedAt ? 'must_find' : 'must_not_flag';

    const diff = await diffFromPrFiles(this.container.reviewRepo, review.prId);
    const files = await this.container.reviewRepo.getPrFiles(review.prId);
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);

    const expected: ExpectedFinding = {
      type,
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      severity: finding.severity as ExpectedFinding['severity'],
      category: finding.category as ExpectedFinding['category'],
      title: finding.title,
    };

    const caseInput: EvalCaseInput = {
      owner_kind: 'agent',
      owner_id: review.agentId,
      name: finding.title,
      input_diff: diff.raw,
      input_files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
      input_meta: {
        repo: repo ? repo.fullName : null,
        number: pull.number,
        title: pull.title,
        author: pull.author,
        base: pull.base,
        head_sha: pull.headSha,
      },
      expected_output: [expected],
    };

    return this.repo.createCase(workspaceId, caseInput, input.finding_id);
  }

  // ---- case CRUD passthroughs ------------------------------------------------

  listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    return this.repo.listCasesForAgent(workspaceId, agentId);
  }

  createCase(workspaceId: string, input: EvalCaseInput): Promise<EvalCase> {
    return this.repo.createCase(workspaceId, input);
  }

  updateCase(
    workspaceId: string,
    caseId: string,
    patch: EvalCaseUpdate,
  ): Promise<EvalCase | undefined> {
    return this.repo.updateCase(workspaceId, caseId, patch);
  }

  deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, caseId);
  }

  /** AC-26 — finding ids that already back an eval case. */
  findingsWithCases(findingIds: string[]): Promise<Set<string>> {
    return this.repo.casesBackedByFindings(findingIds);
  }

  // ---- dashboard (R9) ---------------------------------------------------------

  dashboard(workspaceId: string): Promise<EvalDashboardOverview>;
  dashboard(workspaceId: string, agentId: string): Promise<EvalDashboard>;
  async dashboard(
    workspaceId: string,
    agentId?: string,
  ): Promise<EvalDashboard | EvalDashboardOverview> {
    if (agentId) return this.agentDashboard(workspaceId, agentId);
    return this.dashboardOverview(workspaceId);
  }

  /** Cross-agent landing page (G8) — `GET /eval/dashboard`. */
  private async dashboardOverview(workspaceId: string): Promise<EvalDashboardOverview> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const latestByAgent = await this.repo.latestBatchPerAgent(workspaceId);

    const agentsOut = await Promise.all(
      agents.map(async (a) => {
        const trend = await this.repo.batchTrendForAgent(workspaceId, a.id);
        return {
          agent_id: a.id,
          agent_name: a.name,
          model: a.model,
          latest_batch: latestByAgent.get(a.id) ?? null,
          sparkline: trend.map((b) => (b.total_count > 0 ? b.pass_count / b.total_count : 0)),
        };
      }),
    );

    const recentBatches = await this.repo.recentBatches(workspaceId, 20);
    return { agents: agentsOut, recent_runs: recentBatches };
  }

  /** Single-agent detail page (design/06) — `GET /agents/:id/eval/dashboard`. */
  private async agentDashboard(workspaceId: string, agentId: string): Promise<EvalDashboard> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.repo.listCasesForAgent(workspaceId, agentId);
    const trend = await this.repo.batchTrendForAgent(workspaceId, agentId);
    const latest = trend[trend.length - 1];
    const previous = trend[trend.length - 2];

    // G2/G3: `EvalDashboard.current`/`delta`'s recall/precision/citation_accuracy
    // are ALL nullable (widened alongside `recall` — see eval-ci.ts) so a 0/0
    // aggregate (no batch yet, or a batch whose covered-set was empty) is
    // representable as "n/a" and never coerced to a misleading 0.
    const current = {
      recall: latest?.recall ?? null,
      precision: latest?.precision ?? null,
      citation_accuracy: latest?.citation_accuracy ?? null,
      traces_passed: latest?.pass_count ?? 0,
      traces_total: latest?.total_count ?? 0,
      cost_usd: latest?.cost_usd ?? null,
    };

    const delta = {
      recall:
        latest?.recall != null && previous?.recall != null ? latest.recall - previous.recall : null,
      precision:
        latest?.precision != null && previous?.precision != null
          ? latest.precision - previous.precision
          : null,
      citation_accuracy:
        latest?.citation_accuracy != null && previous?.citation_accuracy != null
          ? latest.citation_accuracy - previous.citation_accuracy
          : null,
    };

    const trendPoints: EvalTrendPoint[] = trend.map((b) => ({
      ran_at: b.ran_at,
      recall: b.recall ?? 0,
      precision: b.precision ?? 0,
      citation_accuracy: b.citation_accuracy ?? 0,
      pass_rate: b.total_count > 0 ? b.pass_count / b.total_count : 0,
      cost_usd: b.cost_usd,
    }));

    const recentRuns = latest ? await this.repo.runsForBatch(workspaceId, latest.id) : [];

    const alert = buildRegressionAlert({
      latestPrecision: latest?.precision,
      previousPrecision: previous?.precision,
      latestVersion: latest?.agent_version ?? 0,
      recallDelta: delta.recall,
      citationDelta: delta.citation_accuracy,
    });

    return {
      owner_kind: 'agent',
      owner_id: agentId,
      cases_total: cases.length,
      current,
      delta,
      trend: trendPoints,
      recent_runs: recentRuns,
      alert,
    };
  }
}
