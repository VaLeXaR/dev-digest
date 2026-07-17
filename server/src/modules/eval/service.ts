import type { Container } from '../../platform/container.js';
import type {
  EvalCase,
  EvalCaseFromFindingInput,
  EvalCaseInput,
  EvalCaseSeed,
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
import { sliceDiff } from '../reviews/helpers.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { REVIEW_STRATEGY } from '../reviews/constants.js';
import type { AgentRow } from '../../db/rows.js';
import { EvalRepository, type EvalCaseUpdate } from './repository.js';
import * as runRepo from './repository/run.repo.js';
import { aggregateBatch, buildRegressionAlert, buildTrendPoints, type CaseRunResult } from './helpers.js';
import { SKILL_EVAL_MODEL, SKILL_EVAL_PROVIDER } from './skill-run.constants.js';

/**
 * R9: narrows a persisted `EvalCase.input_meta` (`z.unknown()` on the
 * contract, `jsonb` in the DB — any previous writer could have put a string,
 * a number, an array, or `null` there) into an optional PR description for
 * `executeSkillCase` ONLY. Never cast; guard with `typeof === 'object'`.
 * Returns `undefined` (never `''`) when neither `title` nor `body` is a
 * non-empty string, so the caller can spread-conditionally and omit the
 * `prDescription` key entirely rather than adding an empty PR-description
 * block to the assembled prompt. Deliberately NOT used by `executeCase` (the
 * agent path) — see R9 in `docs/plans/skill-eval-code-input/plan.md`.
 */
/**
 * R5 (grilling G-2): mirrors the (non-exported) `overlaps` helper in
 * `reviewer-core/src/eval/score.ts:34-40` — true when the inclusive
 * [start,end] ranges overlap at at least one line.
 */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

function prDescriptionFrom(meta: unknown): string | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined;

  const title = 'title' in meta && typeof meta.title === 'string' ? meta.title.trim() : '';
  const body = 'body' in meta && typeof meta.body === 'string' ? meta.body.trim() : '';

  if (title && body) return `${title}\n\n${body}`;
  if (title) return title;
  if (body) return body;
  return undefined;
}

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
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      ownerVersion: agent.version,
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
   * "Run on evals" / "Run all evals" for a SKILL (R4/AC-33) — runs the skill's
   * `body` as the review's system prompt over every case in its set as ONE
   * batch. No host agent (AC-38): no `skills[]`, no `strategy`, fixed
   * provider/model (`SKILL_EVAL_PROVIDER`/`SKILL_EVAL_MODEL`). AC-37: does
   * NOT gate on `skill.enabled` — a disabled skill is still eval-able.
   * AC-36 per-case failure isolation is inherited from `executeSkillCase`'s
   * try/catch (same shape as `executeCase`).
   */
  async runSkillSet(workspaceId: string, skillId: string): Promise<EvalRunBatchResult> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    const cases = await this.repo.listCasesForOwner(workspaceId, 'skill', skillId);
    const llm = await this.container.llm(SKILL_EVAL_PROVIDER);

    const results: CaseRunResult[] = [];
    for (const evalCase of cases) {
      results.push(await this.executeSkillCase(skill.body, llm, evalCase));
    }

    const aggregate = aggregateBatch(results);
    const batch = await this.repo.insertBatch({
      workspaceId,
      ownerKind: 'skill',
      ownerId: skill.id,
      ownerVersion: skill.version,
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
   * dashboard / Compare. Owner-generic (T-04): an agent-owned case runs
   * through the agent's own provider/model/skills; a skill-owned case runs
   * through the fixed skill-eval provider/model, no host agent (AC-38).
   */
  async runCase(workspaceId: string, caseId: string): Promise<EvalRunRecord> {
    const evalCase = await this.repo.getCase(workspaceId, caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');

    let result: CaseRunResult;
    if (evalCase.owner_kind === 'agent') {
      const agent = await this.container.agentsRepo.getById(workspaceId, evalCase.owner_id);
      if (!agent) throw new NotFoundError('Owning agent not found');

      const llm = await this.container.llm(agent.provider as Provider);
      const skills = await this.resolveSkills(agent.id);
      result = await this.executeCase(agent, llm, skills, evalCase);
    } else if (evalCase.owner_kind === 'skill') {
      const skill = await this.container.skillsRepo.getById(workspaceId, evalCase.owner_id);
      if (!skill) throw new NotFoundError('Owning skill not found');

      const llm = await this.container.llm(SKILL_EVAL_PROVIDER);
      result = await this.executeSkillCase(skill.body, llm, evalCase);
    } else {
      throw new AppError(
        'unsupported_case_owner',
        'Unsupported eval-case owner kind.',
        400,
      );
    }

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
        // R6: mirror production's default (`run-executor.ts:264`) rather than
        // the engine's own `'auto'` default, so an agent with a null strategy
        // is evaluated under the same mode it's actually reviewed under.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
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

  /**
   * Execute one case against a skill's `body` as the review's system prompt
   * (R5/AC-38) — no host agent: fixed provider/model, no `skills[]`, no
   * `strategy`. Mirrors `executeCase`'s shape exactly (parse diff once,
   * reconstruct the raw pre-grounding finding set, score, AC-36 try/catch)
   * so `scoreEvalCase`/`groundFindings` behave identically for both owners.
   * R9: also maps the persisted `input_meta.{title,body}` into `prDescription`
   * — SKILL-owned cases only (`executeCase`, the agent path, deliberately does
   * NOT do this, see `prDescriptionFrom`'s doc comment).
   */
  private async executeSkillCase(
    skillBody: string,
    llm: LLMProvider,
    evalCase: EvalCase,
  ): Promise<CaseRunResult> {
    const start = Date.now();
    try {
      const diff = parseUnifiedDiff(evalCase.input_diff);
      const prDescription = prDescriptionFrom(evalCase.input_meta);
      const outcome = await reviewPullRequest({
        systemPrompt: skillBody,
        model: SKILL_EVAL_MODEL,
        diff,
        llm,
        ...(prDescription !== undefined ? { prDescription } : {}),
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
   * Owner-generic case list for a skill's Evals tab (R2). `repository.ts` has
   * no skill-specific passthrough of its own beyond the already-generic
   * `listCasesForOwner` (T-03) — call it directly with `'skill'`.
   */
  listSkillCases(workspaceId: string, skillId: string): Promise<EvalCase[]> {
    return this.repo.listCasesForOwner(workspaceId, 'skill', skillId);
  }

  /**
   * Per-case latest run for every case owned by a skill (batch OR scratch,
   * mirrors `lastRunsForAgent`). Calls `run.repo.ts`'s generalized
   * `lastRunsForOwnerCases` directly (not through `EvalRepository`, which is
   * outside this task's owned paths and only exposes the agent-scoped
   * `lastRunsForAgentCases` passthrough) — still no `db/schema`/`drizzle-orm`
   * import here, `run.repo.ts` owns the query.
   */
  lastRunsForSkill(workspaceId: string, skillId: string): Promise<EvalRunRecord[]> {
    return runRepo.lastRunsForOwnerCases(this.container.db, workspaceId, 'skill', skillId);
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
   * Load a finding and validate it can back an eval case (owning agent present,
   * finding decided). Shared by `evalCaseSeed` (read-only preview) and
   * `createCaseFromFinding` (persist) so both enforce the exact same gate.
   */
  private async loadDecidedFinding(workspaceId: string, findingId: string) {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    if (!ctx.review.agentId) {
      throw new AppError(
        'no_owning_agent',
        'This review has no owning agent (summary or legacy review) so no eval case can be created from it.',
        400,
      );
    }
    if (!ctx.finding.acceptedAt && !ctx.finding.dismissedAt) {
      throw new ValidationError('Finding must be accepted or dismissed first');
    }
    return ctx;
  }

  /**
   * Build the pre-filled eval-case fixture for a decided finding WITHOUT
   * persisting. Restores spec AC-3 (docs/plans/eval-case-diff-fragment.md,
   * superseding G4 in eval-pipeline.md): the snapshot is a diff FRAGMENT — the
   * finding's own file only, sliced out of the PR's persisted `pr_files`
   * patches (no live git) — not the whole PR. AC-1/AC-2: the expectation type
   * is derived from the finding's persisted decision (accepted → `must_find`,
   * dismissed → `must_not_flag`).
   */
  private async buildSeedFromFinding(
    ctx: NonNullable<Awaited<ReturnType<Container['reviewRepo']['findingContext']>>>,
  ): Promise<{ owner: EvalCaseSeed['owner']; seed: EvalCaseInput }> {
    const { finding, review, pull } = ctx;
    const agentId = review.agentId!;

    const type: ExpectedFinding['type'] = finding.acceptedAt ? 'must_find' : 'must_not_flag';

    const diff = await diffFromPrFiles(this.container.reviewRepo, review.prId);
    const files = await this.container.reviewRepo.getPrFiles(review.prId);
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    const agent = await this.container.agentsRepo.getById(pull.workspaceId, agentId);

    // R3 before-guard: the finding's file must actually be snapshotted with a
    // patch. A truncated/incomplete `pr_files` import (see T-01) would
    // otherwise make the fragment unbuildable — never fall back to a
    // whole-PR or empty fixture; fail loudly instead.
    const snapshottedFile = files.find((f) => f.path === finding.file && f.patch != null);
    if (!snapshottedFile) {
      throw new AppError(
        'finding_file_not_snapshotted',
        `This PR's imported file list has no patch for "${finding.file}" — the PR's file list may be truncated, or the file has no diff. Re-import the PR so its files are fully fetched, then try again.`,
      );
    }

    // R2: slice the PR diff down to the finding's own file — a fragment, not
    // the whole PR. `sliceDiff` silently returns the ENTIRE raw diff when the
    // path isn't found (reviewer-core INSIGHTS 2026-07-17) — the before-guard
    // above and the re-parse after-guard below are both mandatory; a
    // "successful" slice alone is never proof the file was actually found.
    const fragmentRaw = sliceDiff(diff, finding.file);
    const fragmentParsed = parseUnifiedDiff(fragmentRaw);
    if (fragmentParsed.files.length !== 1 || fragmentParsed.files[0]?.path !== finding.file) {
      throw new AppError(
        'finding_file_not_snapshotted',
        `Slicing the PR diff down to "${finding.file}" did not yield a single-file fragment — the PR's file list may be truncated. Re-import the PR so its files are fully fetched, then try again.`,
      );
    }

    const expected: ExpectedFinding = {
      type,
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      severity: finding.severity as ExpectedFinding['severity'],
      category: finding.category as ExpectedFinding['category'],
      title: finding.title,
    };

    const seed: EvalCaseInput = {
      owner_kind: 'agent',
      owner_id: agentId,
      name: `From finding: ${finding.title}`,
      input_diff: fragmentRaw,
      input_files: files
        .filter((f) => f.path === finding.file)
        .map((f) => ({
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

    return { owner: { kind: 'agent', id: agentId, name: agent?.name ?? 'Agent' }, seed };
  }

  /**
   * Read-only seed for the "Turn into eval case" modal (screen 2) — the owning
   * agent, the finding-derived fixture, and any case this finding ALREADY backs
   * WHOSE TYPE MATCHES THE CURRENT DECISION (accepted → a positive/`must_find`
   * case, dismissed → a negative case). A stale case from a prior, now-reversed
   * decision is ignored so the client seeds a fresh case of the correct type
   * instead of reopening the wrong one. Persists nothing.
   */
  async evalCaseSeed(workspaceId: string, findingId: string): Promise<EvalCaseSeed> {
    const ctx = await this.loadDecidedFinding(workspaceId, findingId);
    const wantPositive = !!ctx.finding.acceptedAt;
    const cases = await this.repo.casesBySourceFinding(workspaceId, findingId);
    const existing =
      cases.find((c) => c.expected_output.some((e) => e.type === 'must_find') === wantPositive) ?? null;
    const { owner, seed } = await this.buildSeedFromFinding(ctx);
    return { owner, existing_case: existing, seed };
  }

  /**
   * G6: the owner agent is resolved SERVER-SIDE from the finding's own review.
   * The input fixture (diff/files/meta) is always re-snapshotted here and never
   * taken from the caller; only `name`/`expected_output` may be overridden by
   * the seed-modal edits (screen 2). AC-26: always creates a NEW case, never
   * updates an existing one for the same finding.
   */
  async createCaseFromFinding(
    workspaceId: string,
    input: EvalCaseFromFindingInput,
  ): Promise<EvalCase> {
    const ctx = await this.loadDecidedFinding(workspaceId, input.finding_id);
    const { seed } = await this.buildSeedFromFinding(ctx);

    const caseInput: EvalCaseInput = {
      ...seed,
      name: input.name ?? seed.name,
      expected_output: input.expected_output ?? seed.expected_output,
    };

    // R5 (grilling G-2): hard-reject a case that CONTRADICTS an existing case
    // for the same owner — same file, overlapping range, opposite type. Left
    // unguarded, the eval set can hold e.g. a `must_find` and a `must_not_flag`
    // on the same file+range, which no agent output can ever satisfy both of
    // (server INSIGHTS 2026-07-17). This guards the CREATE path only — the
    // read-only seed/preview paths are untouched.
    const existingCases = await this.repo.listCasesForOwner(workspaceId, 'agent', seed.owner_id);
    for (const newExpectation of caseInput.expected_output) {
      for (const existingCase of existingCases) {
        const conflict = existingCase.expected_output.find(
          (existingExpectation) =>
            existingExpectation.file === newExpectation.file &&
            existingExpectation.type !== newExpectation.type &&
            rangesOverlap(
              existingExpectation.start_line,
              existingExpectation.end_line,
              newExpectation.start_line,
              newExpectation.end_line,
            ),
        );
        if (conflict) {
          throw new AppError(
            'contradictory_case',
            `A ${conflict.type} eval case already exists for ${conflict.file}:${conflict.start_line}-${conflict.end_line} (case ${existingCase.id}); resolve it before adding this one.`,
            409,
          );
        }
      }
    }

    return this.repo.createCase(workspaceId, caseInput, input.finding_id);
  }

  /**
   * EPHEMERAL run of a not-yet-saved seed case (screen 2's "Run case" before
   * Save). Rebuilds the fixture from the finding, runs the owning agent, and
   * scores against the caller's in-progress `expectedOutput` — but persists
   * NOTHING (no `eval_cases` row, no `eval_runs` row). Only Save creates the
   * case; only saved cases get persisted runs. Returns an unsaved
   * `EvalRunRecord` (synthetic `id`/`case_id` = "preview") for the modal to show.
   */
  async evalRunPreviewFromFinding(
    workspaceId: string,
    findingId: string,
    expectedOutput: ExpectedFinding[],
  ): Promise<EvalRunRecord> {
    const ctx = await this.loadDecidedFinding(workspaceId, findingId);
    const { owner, seed } = await this.buildSeedFromFinding(ctx);

    const agent = await this.container.agentsRepo.getById(workspaceId, owner.id);
    if (!agent) throw new NotFoundError('Owning agent not found');
    const llm = await this.container.llm(agent.provider as Provider);
    const skills = await this.resolveSkills(agent.id);

    const ephemeral: EvalCase = {
      id: 'preview',
      owner_kind: 'agent',
      owner_id: owner.id,
      name: seed.name,
      input_diff: seed.input_diff,
      input_files: seed.input_files ?? null,
      input_meta: seed.input_meta ?? null,
      expected_output: expectedOutput,
      notes: null,
    };

    const result = await this.executeCase(agent, llm, skills, ephemeral);

    return {
      id: 'preview',
      case_id: 'preview',
      case_name: seed.name,
      ran_at: new Date().toISOString(),
      actual_output: result.actualOutput,
      pass: result.pass,
      recall: result.recall,
      precision: result.precision,
      citation_accuracy: result.citation_accuracy,
      duration_ms: result.durationMs,
      cost_usd: result.costUsd,
    };
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

    const trendPoints: EvalTrendPoint[] = buildTrendPoints(trend);

    const recentRuns = latest ? await this.repo.runsForBatch(workspaceId, latest.id) : [];

    const alert = buildRegressionAlert({
      latestPrecision: latest?.precision,
      previousPrecision: previous?.precision,
      latestVersion: latest?.owner_version ?? 0,
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
