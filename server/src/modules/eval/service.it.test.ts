import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { CompletionResult, CompletionRequest, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { Review, type EvalCaseInput } from '@devdigest/shared';
import { scoreEvalCase } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
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
    async function seedReviewWithFinding(
      db: PgFixture['handle']['db'],
      workspaceId: string,
      agentId: string,
      opts: { accepted?: boolean; dismissed?: boolean },
    ) {
      const [repoRow] = await db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'widgets', fullName: 'acme/widgets' })
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
        patch: '@@ -1,3 +1,4 @@\n export function greet(name) {\n+  if (!name) throw new Error();\n   return name;\n }',
      });
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId: pull!.id, agentId, kind: 'review' })
        .returning();
      const [finding] = await db
        .insert(t.findings)
        .values({
          reviewId: review!.id,
          file: 'src/greet.ts',
          startLine: 2,
          endLine: 2,
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
