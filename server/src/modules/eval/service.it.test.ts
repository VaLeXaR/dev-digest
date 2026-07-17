import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { CompletionResult, CompletionRequest, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { Review, type EvalCaseInput } from '@devdigest/shared';
import { scoreEvalCase } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { AppError } from '../../platform/errors.js';
import { AgentsRepository } from '../agents/repository.js';
import type { AgentRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { EvalService } from './service.js';
import { EvalRepository } from './repository.js';

/**
 * DB-backed integration test for `EvalService` (T-05 of eval-pipeline.md).
 * Constructs a real `Container` (real Postgres, real `agentsRepo`/`reviewRepo`)
 * with ONLY the LLM provider swapped for `MockLLMProvider` — never goes
 * through `buildApp`/HTTP since routes are T-07's owned paths, and never
 * touches `reviews`/`findings`/`agent_runs` (the fire-and-forget path this
 * module deliberately does not reuse).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// Diff whose single hunk covers new-side lines 2 (the `+` line) — mirrors the
// review-diff/why-risk-brief it.test fixtures so the mock finding survives
// citation-grounding.
function sampleDiff(path: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,3 +1,4 @@',
    ' export function greet(name) {',
    "+  if (!name) throw new Error('name required');",
    '   return name;',
    ' }',
  ].join('\n');
}

/**
 * T-04: a multi-file diff LARGE enough that `selectMode`'s 'auto' branch
 * (reviewer-core/src/review/run.ts:120-126) would pick map-reduce — total
 * changed lines > DEFAULT_MAP_THRESHOLD_LINES (400) AND files.length > 1 —
 * i.e. ONE `completeStructured` call PER FILE (2 calls) under 'auto', vs.
 * exactly ONE call under single-pass.
 */
function bigMultiFileDiff(pathA: string, pathB: string, linesEach = 210): string {
  const fileDiff = (path: string) => {
    const added = Array.from({ length: linesEach }, (_, i) => `+line ${i} of ${path}`).join('\n');
    return [
      `diff --git a/${path} b/${path}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -1,0 +1,${linesEach} @@`,
      added,
    ].join('\n');
  };
  return [fileDiff(pathA), fileDiff(pathB)].join('\n');
}

function fixtureReview(path: string): Review {
  return {
    verdict: 'comment',
    summary: 'One suggestion.',
    score: 50,
    findings: [
      {
        id: 'f1',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Guard against empty name',
        file: path,
        start_line: 2,
        end_line: 2,
        rationale: 'Throwing early avoids a bad return value.',
        suggestion: null,
        confidence: 0.8,
      },
    ],
  };
}

/**
 * A stub LLM whose `completeStructured` throws when the assembled prompt
 * contains `failMarker` (AC-18 simulation) — otherwise behaves exactly like
 * `MockLLMProvider` returning `structured`. Message content is where the
 * per-case diff text lands (`assemblePrompt` -> the diff hunk's file path is
 * unique per case), so a marker filename is enough to target exactly one case.
 */
class FlakyLLMProvider extends MockLLMProvider {
  constructor(
    structured: Review,
    private failMarker: string,
  ) {
    super('openai', { structured });
  }

  override async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (req.messages.some((m) => m.content.includes(this.failMarker))) {
      throw new Error('Simulated LLM failure');
    }
    return super.complete(req);
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.messages.some((m) => m.content.includes(this.failMarker))) {
      throw new Error('Simulated LLM failure');
    }
    return super.completeStructured(req);
  }
}

let wsSeq = 0;
async function makeWorkspace(db: PgFixture['handle']['db']): Promise<string> {
  const [ws] = await db
    .insert(t.workspaces)
    .values({ name: ['eval-service-test', wsSeq++].join('-') })
    .returning();
  return ws!.id;
}

async function makeAgent(db: PgFixture['handle']['db'], workspaceId: string) {
  const [row] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name: 'Eval Test Agent',
      provider: 'openai',
      model: 'test-model',
      systemPrompt: 'You are a reviewer.',
      enabled: true,
    })
    .returning();
  return row!;
}

/** T-04 — a skill has no provider/model/host agent (`body`/`version`/`enabled` only). */
async function makeSkill(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { enabled?: boolean } = {},
) {
  const [row] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name: 'Eval Test Skill',
      description: 'A skill rubric used for eval integration tests.',
      type: 'rubric',
      source: 'manual',
      body: 'You are a strict code reviewer. Flag missing null checks.',
      enabled: opts.enabled ?? true,
    })
    .returning();
  return row!;
}

d('EvalService (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  }, 60_000);

  afterAll(async () => {
    await pg?.stop();
  });

  describe('runSet', () => {
    it('writes ONE batch + one eval_runs row per case, matching scoreEvalCase, using only the injected mock', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/greet.ts';
      const diffText = sampleDiff(path);
      const caseInput: EvalCaseInput = {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'case-a',
        input_diff: diffText,
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      };
      const evalCase = await repo.createCase(workspaceId, caseInput);

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openai: mockLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSet(workspaceId, agent.id);

      expect(batch.owner_kind).toBe('agent');
      expect(batch.owner_id).toBe(agent.id);
      expect(batch.owner_version).toBe(agent.version);
      expect(batch.total_count).toBe(1);

      const runs = await repo.runsForBatch(workspaceId, batch.id);
      expect(runs).toHaveLength(1);

      // Independently compute the expected score the exact same way the
      // service does, and assert the persisted run matches it exactly.
      const diff = parseUnifiedDiff(diffText);
      const raw = fixtureReview(path).findings;
      const expectedScore = scoreEvalCase(evalCase.expected_output, raw, diff);

      expect(runs[0]?.pass).toBe(expectedScore.pass);
      expect(runs[0]?.recall).toBe(expectedScore.recall);
      expect(runs[0]?.precision).toBe(expectedScore.precision);
      expect(runs[0]?.citation_accuracy).toBe(expectedScore.citation_accuracy);

      expect(batch.recall).toBe(expectedScore.recall);
      expect(batch.pass_count).toBe(expectedScore.pass ? 1 : 0);

      // Only the injected mock was ever invoked (no live provider calls).
      expect(mockLlm.calls.length).toBeGreaterThan(0);
      expect(mockLlm.calls.every((c) => c.method === 'completeStructured')).toBe(true);
    });

    it('AC-18: a failing case is recorded pass=false with a reason, siblings still run', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const okPath = 'src/ok.ts';
      const failPath = 'src/FAIL_MARKER.ts';

      const okCase = await repo.createCase(workspaceId, {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'case-ok',
        input_diff: sampleDiff(okPath),
        expected_output: [{ type: 'must_find', file: okPath, start_line: 2, end_line: 2 }],
      });
      const failCase = await repo.createCase(workspaceId, {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'case-fail',
        input_diff: sampleDiff(failPath),
        expected_output: [{ type: 'must_find', file: failPath, start_line: 2, end_line: 2 }],
      });

      const flakyLlm = new FlakyLLMProvider(fixtureReview(okPath), 'FAIL_MARKER');
      const container = new Container(config(), pg.handle.db, {
        llm: { openai: flakyLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSet(workspaceId, agent.id);
      expect(batch.total_count).toBe(2);

      const runs = await repo.runsForBatch(workspaceId, batch.id);
      const okRun = runs.find((r) => r.case_id === okCase.id);
      const failRun = runs.find((r) => r.case_id === failCase.id);

      expect(failRun?.pass).toBe(false);
      expect(failRun?.recall).toBeNull();
      expect(JSON.stringify(failRun?.actual_output)).toContain('Simulated LLM failure');

      // The sibling case still ran and scored normally despite the failure.
      expect(okRun).toBeDefined();
      expect(okRun?.pass).toBe(true);
      expect(okRun?.recall).toBe(1);
    });
  });

  describe('T-04: default review strategy alignment', () => {
    it("an agent seeded with strategy = null runs a case under single-pass (1 LLM call), not 'auto'/map-reduce", async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const pathA = 'src/big-a.ts';
      const pathB = 'src/big-b.ts';
      const diffText = bigMultiFileDiff(pathA, pathB);
      const evalCase = await repo.createCase(workspaceId, {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'strategy-null-case',
        input_diff: diffText,
        expected_output: [],
      });

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(pathA) });
      const container = new Container(config(), pg.handle.db, { llm: { openai: mockLlm } });

      // The `agents.strategy` column is NOT NULL with a default (`schema/agents.ts`),
      // so a real row can never actually be null — patch the prototype for this
      // one lookup to simulate the defensive null case (same pattern as server
      // INSIGHTS 2026-07-02's `ReviewRepository.prototype` spies).
      const spy = vi
        .spyOn(AgentsRepository.prototype, 'getById')
        .mockResolvedValue({ ...agent, strategy: null as unknown as AgentRow['strategy'] });

      try {
        const service = new EvalService(container);
        await service.runCase(workspaceId, evalCase.id);
      } finally {
        spy.mockRestore();
      }

      const structuredCalls = mockLlm.calls.filter((c) => c.method === 'completeStructured');
      // Single-pass = exactly ONE call regardless of file count. Under the old
      // `agent.strategy ?? undefined` -> engine default 'auto', this diff
      // (2 files, 420 changed lines > the 400-line threshold) would have
      // triggered map-reduce = 2 calls (one per file).
      expect(structuredCalls).toHaveLength(1);
    });
  });

  describe('runSkillSet (T-04)', () => {
    it('writes ONE batch (owner_kind=skill) + one eval_runs row per case, with 0 LLM calls in the scoring step', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const skill = await makeSkill(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/greet.ts';
      const diffText = sampleDiff(path);
      const caseInput: EvalCaseInput = {
        owner_kind: 'skill',
        owner_id: skill.id,
        name: 'skill-case-a',
        input_diff: diffText,
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      };
      const evalCase = await repo.createCase(workspaceId, caseInput);

      // SKILL_EVAL_PROVIDER is 'openrouter' — MockLLMProvider's constructor
      // doesn't accept that id (server INSIGHTS 2026-07-15), so register the
      // mock under the 'openrouter' CONTAINER key regardless of the mock's
      // own internal `.id` — `container.llm(id)` looks it up by key, not by
      // the mock's `.id`.
      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openrouter: mockLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSkillSet(workspaceId, skill.id);

      expect(batch.owner_kind).toBe('skill');
      expect(batch.owner_id).toBe(skill.id);
      expect(batch.owner_version).toBe(skill.version);
      expect(batch.total_count).toBe(1);

      const runs = await repo.runsForBatch(workspaceId, batch.id);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.case_id).toBe(evalCase.id);

      const diff = parseUnifiedDiff(diffText);
      const raw = fixtureReview(path).findings;
      const expectedScore = scoreEvalCase(evalCase.expected_output, raw, diff);

      expect(runs[0]?.pass).toBe(expectedScore.pass);
      expect(runs[0]?.recall).toBe(expectedScore.recall);
      expect(runs[0]?.precision).toBe(expectedScore.precision);
      expect(runs[0]?.citation_accuracy).toBe(expectedScore.citation_accuracy);

      // Exactly one review call per case (the per-case `reviewPullRequest`
      // call) and NOTHING else — `scoreEvalCase`/`groundFindings` issue zero
      // LLM calls, so the total call count is bounded to the number of cases.
      expect(mockLlm.calls).toHaveLength(1);
      expect(mockLlm.calls[0]?.method).toBe('completeStructured');
    });

    it('R9: input_meta.{title,body} reaches the assembled prompt for a skill case', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const skill = await makeSkill(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/greet.ts';
      const evalCase = await repo.createCase(workspaceId, {
        owner_kind: 'skill',
        owner_id: skill.id,
        name: 'skill-case-meta',
        input_diff: sampleDiff(path),
        input_meta: { title: 'Add Stripe integration', body: 'Wire up payments via Stripe SDK.' },
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      });

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openrouter: mockLlm },
      });
      const service = new EvalService(container);

      await service.runSkillSet(workspaceId, skill.id);

      expect(mockLlm.calls).toHaveLength(1);
      const req = mockLlm.calls[0]?.req as StructuredRequest<unknown>;
      const promptText = req.messages.map((m) => m.content).join('\n');
      expect(promptText).toContain('Add Stripe integration');
      expect(promptText).toContain('Wire up payments via Stripe SDK.');
      expect(evalCase.input_meta).toBeTruthy();
    });

    it('R9: input_meta=null produces no empty PR-description block and the run still succeeds', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const skill = await makeSkill(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/greet.ts';
      await repo.createCase(workspaceId, {
        owner_kind: 'skill',
        owner_id: skill.id,
        name: 'skill-case-null-meta',
        input_diff: sampleDiff(path),
        input_meta: null,
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      });

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openrouter: mockLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSkillSet(workspaceId, skill.id);
      expect(batch.total_count).toBe(1);

      expect(mockLlm.calls).toHaveLength(1);
      const req = mockLlm.calls[0]?.req as StructuredRequest<unknown>;
      const promptText = req.messages.map((m) => m.content).join('\n');
      expect(promptText).not.toMatch(/PR Description/i);
    });

    it('R9: input_meta as a non-object (string) does not throw and produces no PR description', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const skill = await makeSkill(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/greet.ts';
      await repo.createCase(workspaceId, {
        owner_kind: 'skill',
        owner_id: skill.id,
        name: 'skill-case-string-meta',
        input_diff: sampleDiff(path),
        input_meta: 'nope',
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      });

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openrouter: mockLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSkillSet(workspaceId, skill.id);
      expect(batch.total_count).toBe(1);

      expect(mockLlm.calls).toHaveLength(1);
      const req = mockLlm.calls[0]?.req as StructuredRequest<unknown>;
      const promptText = req.messages.map((m) => m.content).join('\n');
      expect(promptText).not.toContain('nope');
      expect(promptText).not.toMatch(/PR Description/i);
    });

    it('R9: an AGENT case with a titled input_meta does NOT surface it in the prompt (skill-only boundary)', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/greet.ts';
      await repo.createCase(workspaceId, {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'agent-case-meta',
        input_diff: sampleDiff(path),
        input_meta: { title: 'Add Stripe integration', body: 'Wire up payments via Stripe SDK.' },
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      });

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openai: mockLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSet(workspaceId, agent.id);
      expect(batch.total_count).toBe(1);

      expect(mockLlm.calls).toHaveLength(1);
      const req = mockLlm.calls[0]?.req as StructuredRequest<unknown>;
      const promptText = req.messages.map((m) => m.content).join('\n');
      expect(promptText).not.toContain('Add Stripe integration');
      expect(promptText).not.toContain('Wire up payments via Stripe SDK.');
    });

    it('AC-37: a disabled skill (enabled=false) still produces a batch', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const skill = await makeSkill(pg.handle.db, workspaceId, { enabled: false });
      expect(skill.enabled).toBe(false);
      const repo = new EvalRepository(pg.handle.db);

      const path = 'src/disabled-skill.ts';
      await repo.createCase(workspaceId, {
        owner_kind: 'skill',
        owner_id: skill.id,
        name: 'skill-case-disabled',
        input_diff: sampleDiff(path),
        expected_output: [{ type: 'must_find', file: path, start_line: 2, end_line: 2 }],
      });

      const mockLlm = new MockLLMProvider('openai', { structured: fixtureReview(path) });
      const container = new Container(config(), pg.handle.db, {
        llm: { openrouter: mockLlm },
      });
      const service = new EvalService(container);

      const batch = await service.runSkillSet(workspaceId, skill.id);

      expect(batch.owner_kind).toBe('skill');
      expect(batch.owner_id).toBe(skill.id);
      expect(batch.total_count).toBe(1);
      expect(mockLlm.calls.length).toBeGreaterThan(0);
    });
  });

  describe('createCaseFromFinding', () => {
    let repoSeq = 0;
    async function seedReviewWithFinding(
      db: PgFixture['handle']['db'],
      workspaceId: string,
      agentId: string,
      opts: {
        accepted?: boolean;
        dismissed?: boolean;
        /** T-02: extra `pr_files` rows on OTHER paths, to prove the seed is a fragment, not the whole PR. */
        extraFiles?: string[];
        /** T-02: when false, the finding's own file is imported WITHOUT a patch (truncated-import simulation). */
        findingFileHasPatch?: boolean;
        /** T-03: override the finding's line range (default 2-2) to test overlap vs. non-overlap. */
        startLine?: number;
        endLine?: number;
      },
    ) {
      const repoName = ['widgets', repoSeq++].join('-');
      const [repoRow] = await db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: repoName, fullName: `acme/${repoName}` })
        .returning();
      const [pull] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repoRow!.id,
          number: 7,
          title: 'Guard empty name',
          author: 'marisa.koch',
          branch: 'feat/guard',
          base: 'main',
          headSha: 'deadbeef',
        })
        .returning();
      await db.insert(t.prFiles).values({
        prId: pull!.id,
        path: 'src/greet.ts',
        additions: 1,
        deletions: 0,
        patch:
          opts.findingFileHasPatch === false
            ? null
            : '@@ -1,3 +1,4 @@\n export function greet(name) {\n+  if (!name) throw new Error();\n   return name;\n }',
      });
      for (const extraPath of opts.extraFiles ?? []) {
        await db.insert(t.prFiles).values({
          prId: pull!.id,
          path: extraPath,
          additions: 1,
          deletions: 0,
          patch: `@@ -1,2 +1,3 @@\n context line\n+added in ${extraPath}\n context line`,
        });
      }
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId: pull!.id, agentId, kind: 'review' })
        .returning();
      const [finding] = await db
        .insert(t.findings)
        .values({
          reviewId: review!.id,
          file: 'src/greet.ts',
          startLine: opts.startLine ?? 2,
          endLine: opts.endLine ?? 2,
          severity: 'SUGGESTION',
          category: 'style',
          title: 'Guard against empty name',
          rationale: 'Avoids a bad return value.',
          confidence: 0.8,
          acceptedAt: opts.accepted ? new Date() : null,
          dismissedAt: opts.dismissed ? new Date() : null,
        })
        .returning();
      return { pull: pull!, review: review!, finding: finding! };
    }

    it('create-from-accepted finding -> must_find, with a snapshotted diff', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const { finding } = await seedReviewWithFinding(pg.handle.db, workspaceId, agent.id, {
        accepted: true,
      });

      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      const created = await service.createCaseFromFinding(workspaceId, { finding_id: finding.id });

      expect(created.owner_kind).toBe('agent');
      expect(created.owner_id).toBe(agent.id);
      expect(created.expected_output).toHaveLength(1);
      expect(created.expected_output[0]?.type).toBe('must_find');
      expect(created.expected_output[0]?.file).toBe('src/greet.ts');
      expect(created.input_diff).toContain('src/greet.ts');
      expect(created.input_diff.length).toBeGreaterThan(0);
    });

    it('create-from-dismissed finding -> must_not_flag', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const { finding } = await seedReviewWithFinding(pg.handle.db, workspaceId, agent.id, {
        dismissed: true,
      });

      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      const created = await service.createCaseFromFinding(workspaceId, { finding_id: finding.id });

      expect(created.expected_output[0]?.type).toBe('must_not_flag');
    });

    it('always creates a NEW case even when the finding already backs one (AC-26)', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const { finding } = await seedReviewWithFinding(pg.handle.db, workspaceId, agent.id, {
        accepted: true,
      });

      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      const first = await service.createCaseFromFinding(workspaceId, { finding_id: finding.id });
      const second = await service.createCaseFromFinding(workspaceId, { finding_id: finding.id });

      expect(first.id).not.toBe(second.id);
      const repo = new EvalRepository(pg.handle.db);
      const backed = await repo.casesBackedByFindings([finding.id]);
      expect(backed.has(finding.id)).toBe(true);
    });

    it('T-02: a finding on a multi-file PR yields a fragment seed — input_diff parses to exactly one file === finding.file, input_files.length === 1', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const { finding } = await seedReviewWithFinding(pg.handle.db, workspaceId, agent.id, {
        accepted: true,
        extraFiles: ['src/other.ts', 'src/third.ts'],
      });

      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      const created = await service.createCaseFromFinding(workspaceId, { finding_id: finding.id });

      const parsed = parseUnifiedDiff(created.input_diff);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0]?.path).toBe('src/greet.ts');
      expect(created.input_diff).not.toContain('src/other.ts');
      expect(created.input_diff).not.toContain('src/third.ts');
      const inputFiles = created.input_files as { path: string }[] | null;
      expect(inputFiles).toHaveLength(1);
      expect(inputFiles?.[0]?.path).toBe('src/greet.ts');
    });

    it('T-02: a finding whose file has no patch in pr_files throws finding_file_not_snapshotted (not a whole-PR fallback)', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const { finding } = await seedReviewWithFinding(pg.handle.db, workspaceId, agent.id, {
        accepted: true,
        findingFileHasPatch: false,
      });

      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      let createErr: unknown;
      try {
        await service.createCaseFromFinding(workspaceId, { finding_id: finding.id });
      } catch (e) {
        createErr = e;
      }
      expect(createErr).toBeInstanceOf(AppError);
      expect((createErr as AppError).code).toBe('finding_file_not_snapshotted');

      // The read-only seed preview shares the exact same guard.
      let seedErr: unknown;
      try {
        await service.evalCaseSeed(workspaceId, finding.id);
      } catch (e) {
        seedErr = e;
      }
      expect(seedErr).toBeInstanceOf(AppError);
      expect((seedErr as AppError).code).toBe('finding_file_not_snapshotted');
    });

    it('T-03: hard-rejects a create that contradicts an existing case for the same owner+file+overlapping range (409)', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      // First: a dismissed finding on src/greet.ts:2-2 -> must_not_flag case.
      const { finding: dismissedFinding } = await seedReviewWithFinding(
        pg.handle.db,
        workspaceId,
        agent.id,
        { dismissed: true },
      );
      await service.createCaseFromFinding(workspaceId, { finding_id: dismissedFinding.id });

      // Second: an ACCEPTED finding on the SAME file+range -> must_find,
      // opposite type, overlapping range -> hard-reject.
      const { finding: acceptedFinding } = await seedReviewWithFinding(
        pg.handle.db,
        workspaceId,
        agent.id,
        { accepted: true },
      );

      let err: unknown;
      try {
        await service.createCaseFromFinding(workspaceId, { finding_id: acceptedFinding.id });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('contradictory_case');
      expect((err as AppError).statusCode).toBe(409);
    });

    it('T-03: a non-overlapping range create still succeeds (no false-positive contradiction)', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      const { finding: dismissedFinding } = await seedReviewWithFinding(
        pg.handle.db,
        workspaceId,
        agent.id,
        { dismissed: true, startLine: 2, endLine: 2 },
      );
      await service.createCaseFromFinding(workspaceId, { finding_id: dismissedFinding.id });

      // Same file, but a NON-overlapping range -> no contradiction.
      const { finding: nonOverlappingFinding } = await seedReviewWithFinding(
        pg.handle.db,
        workspaceId,
        agent.id,
        { accepted: true, startLine: 50, endLine: 50 },
      );
      const created = await service.createCaseFromFinding(workspaceId, {
        finding_id: nonOverlappingFinding.id,
      });
      expect(created.expected_output[0]?.type).toBe('must_find');
    });

    it('T-03: a same-type create on an overlapping range still succeeds (only opposite type is a contradiction)', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      const { finding: firstDismissed } = await seedReviewWithFinding(
        pg.handle.db,
        workspaceId,
        agent.id,
        { dismissed: true, startLine: 2, endLine: 2 },
      );
      await service.createCaseFromFinding(workspaceId, { finding_id: firstDismissed.id });

      // Same file, overlapping range, SAME type (both must_not_flag) -> no contradiction.
      const { finding: secondDismissed } = await seedReviewWithFinding(
        pg.handle.db,
        workspaceId,
        agent.id,
        { dismissed: true, startLine: 2, endLine: 2 },
      );
      const created = await service.createCaseFromFinding(workspaceId, {
        finding_id: secondDismissed.id,
      });
      expect(created.expected_output[0]?.type).toBe('must_not_flag');
    });

    it('rejects when the finding is neither accepted nor dismissed', async () => {
      const workspaceId = await makeWorkspace(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId);
      const { finding } = await seedReviewWithFinding(pg.handle.db, workspaceId, agent.id, {});

      const container = new Container(config(), pg.handle.db, {});
      const service = new EvalService(container);

      await expect(
        service.createCaseFromFinding(workspaceId, { finding_id: finding.id }),
      ).rejects.toThrow();
    });
  });
});
