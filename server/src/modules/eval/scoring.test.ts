/**
 * L06 (ДЗ#6) — eval scoring regression tests.
 *
 * Target of `pnpm verify:l06` (`vitest run src/modules/eval/scoring.test.ts`).
 *
 * The scoring itself is a pure, zero-LLM function that lives in the review
 * engine (`@devdigest/reviewer-core`) because it depends on the mandatory
 * `groundFindings` citation gate and must obey the onion dependency rule
 * (`server → reviewer-core`, never the reverse). This suite imports it across
 * that boundary and pins two things the homework asks for:
 *
 *   1. The two eval-case types — Accept (`must_find`) and Dismiss
 *      (`must_not_flag`) — are scored correctly on their own.
 *   2. Metrics MOVE when the reviewer prompt changes. `scoreEvalCase` never
 *      calls an LLM, so a "prompt change" is modelled as two different raw
 *      agent outputs for the SAME fixed case (same expected + same diff): the
 *      output a weaker prompt would produce vs. the output an improved prompt
 *      would produce. Better prompt ⇒ better recall / precision /
 *      citation_accuracy / pass.
 */
import { describe, it, expect } from 'vitest';
import type { ExpectedFinding, Finding, UnifiedDiff } from '@devdigest/shared';
import { scoreEvalCase } from '@devdigest/reviewer-core';

let findingCounter = 0;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  findingCounter += 1;
  return {
    id: `finding-${findingCounter}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'Test finding',
    file: 'src/auth.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    confidence: 0.9,
    ...overrides,
  };
}

function makeExpectation(overrides: Partial<ExpectedFinding> = {}): ExpectedFinding {
  return {
    type: 'must_find',
    file: 'src/auth.ts',
    start_line: 10,
    end_line: 10,
    ...overrides,
  };
}

/** A diff whose only hunk covers new-side lines 8-14 of src/auth.ts. */
function makeDiff(overrides: Partial<UnifiedDiff> = {}): UnifiedDiff {
  return {
    raw: '@@ -8,7 +8,7 @@',
    files: [
      {
        path: 'src/auth.ts',
        additions: 7,
        deletions: 0,
        hunks: [
          {
            file: 'src/auth.ts',
            oldStart: 8,
            oldLines: 7,
            newStart: 8,
            newLines: 7,
            newLineNumbers: [8, 9, 10, 11, 12, 13, 14],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('eval scoring — Accept / Dismiss case types', () => {
  it('scores an Accept case (must_find) as passed when the agent flags the required range', () => {
    // Accept: the reviewer SHOULD surface the bug at line 10.
    const expected = [makeExpectation({ type: 'must_find', start_line: 10, end_line: 10 })];
    const raw = [makeFinding({ start_line: 10, end_line: 10 })];

    const score = scoreEvalCase(expected, raw, makeDiff());

    expect(score.recall).toBe(1);
    expect(score.precision).toBe(1);
    expect(score.pass).toBe(true);
  });

  it('scores an Accept case as failed (recall 0) when the agent misses the required range', () => {
    const expected = [makeExpectation({ type: 'must_find', start_line: 10, end_line: 10 })];
    // Agent emits nothing relevant — the required finding is absent.
    const raw: Finding[] = [];

    const score = scoreEvalCase(expected, raw, makeDiff());

    expect(score.recall).toBe(0);
    expect(score.pass).toBe(false);
  });

  it('scores a Dismiss case (must_not_flag) as passed when the agent stays silent on the range', () => {
    // Dismiss: the reviewer must NOT flag the benign line 13.
    const expected = [makeExpectation({ type: 'must_not_flag', start_line: 13, end_line: 13 })];
    const raw: Finding[] = [];

    const score = scoreEvalCase(expected, raw, makeDiff());

    expect(score.pass).toBe(true);
  });

  it('scores a Dismiss case as failed (false positive) when the agent flags the forbidden range', () => {
    const expected = [makeExpectation({ type: 'must_not_flag', start_line: 13, end_line: 13 })];
    const raw = [makeFinding({ start_line: 13, end_line: 13 })];

    const score = scoreEvalCase(expected, raw, makeDiff());

    expect(score.pass).toBe(false);
    expect(score.precision).toBe(0); // the flagged finding is a pure false positive
  });
});

describe('eval scoring — metrics change after a prompt change', () => {
  // One fixed eval case, scored against two different agent outputs. The case
  // mixes both types: an Accept (bug at line 10) and a Dismiss (benign line 13).
  const expected: ExpectedFinding[] = [
    makeExpectation({ type: 'must_find', start_line: 10, end_line: 10 }),
    makeExpectation({ type: 'must_not_flag', start_line: 13, end_line: 13 }),
  ];
  const diff = makeDiff();

  // BEFORE the prompt fix — a weaker prompt: the agent misses the real bug,
  // wrongly flags the benign line (false positive), and hallucinates a finding
  // on a line outside the diff (line 100 → dropped by grounding).
  const outputBeforePromptFix = [
    makeFinding({ start_line: 13, end_line: 13, title: 'noise on benign line' }),
    makeFinding({ start_line: 100, end_line: 100, title: 'hallucinated / ungrounded' }),
  ];

  // AFTER the prompt fix — an improved prompt: the agent catches exactly the
  // required bug, does not touch the benign line, and cites nothing ungrounded.
  const outputAfterPromptFix = [makeFinding({ start_line: 10, end_line: 10, title: 'the real bug' })];

  const before = scoreEvalCase(expected, outputBeforePromptFix, diff);
  const after = scoreEvalCase(expected, outputAfterPromptFix, diff);

  it('recall improves after the prompt change', () => {
    expect(before.recall).toBe(0);
    expect(after.recall).toBe(1);
    expect(after.recall).toBeGreaterThan(before.recall as number);
  });

  it('precision improves after the prompt change', () => {
    expect(before.precision).toBe(0);
    expect(after.precision).toBe(1);
    expect(after.precision).toBeGreaterThan(before.precision as number);
  });

  it('citation_accuracy improves after the prompt change (fewer ungrounded citations)', () => {
    // Before: 1 of 2 raw findings grounded → 0.5. After: 1 of 1 → 1.0.
    expect(before.citation_accuracy).toBe(0.5);
    expect(after.citation_accuracy).toBe(1);
    expect(after.citation_accuracy).toBeGreaterThan(before.citation_accuracy as number);
  });

  it('the case flips from failing to passing after the prompt change', () => {
    expect(before.pass).toBe(false);
    expect(after.pass).toBe(true);
  });
});
