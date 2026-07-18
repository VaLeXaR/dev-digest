/**
 * scoreEvalCase — pure, zero-LLM regression scoring.
 * Pins the R4 overlap-match rule, the G1 grounded-only recall/precision
 * scope, the G2 citation-over-raw scope, the G3 0/0 -> null uniform policy,
 * and the R16 expectation-driven pass rule (never derived from precision).
 */
import { describe, it, expect } from 'vitest';
import type { ExpectedFinding, Finding, UnifiedDiff } from '@devdigest/shared';
import { scoreEvalCase } from './score.js';

let findingCounter = 0;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  findingCounter += 1;
  return {
    id: `finding-${findingCounter}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'Test finding',
    file: 'src/example.ts',
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
    file: 'src/example.ts',
    start_line: 10,
    end_line: 10,
    ...overrides,
  };
}

/** A diff whose only hunk covers new-side lines 8-12 of src/example.ts. */
function makeDiff(overrides: Partial<UnifiedDiff> = {}): UnifiedDiff {
  return {
    raw: '@@ -8,5 +8,5 @@',
    files: [
      {
        path: 'src/example.ts',
        additions: 5,
        deletions: 0,
        hunks: [
          {
            file: 'src/example.ts',
            oldStart: 8,
            oldLines: 5,
            newStart: 8,
            newLines: 5,
            newLineNumbers: [8, 9, 10, 11, 12],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('scoreEvalCase', () => {
  it('has no LLMProvider parameter — 0 LLM calls by construction', () => {
    // scoreEvalCase.length reflects the declared parameter count of the
    // implementation; an injected LLMProvider would add a 4th parameter.
    expect(scoreEvalCase.length).toBe(3);
  });

  it('credits a matched must_find (grounded finding overlapping the expected range)', () => {
    const expected = [makeExpectation({ type: 'must_find', start_line: 9, end_line: 11 })];
    const raw = [makeFinding({ start_line: 10, end_line: 10 })];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    expect(result.recall).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('fails on a triggered must_not_flag (grounded finding overlaps a forbidden range)', () => {
    const expected = [makeExpectation({ type: 'must_not_flag', start_line: 9, end_line: 11 })];
    const raw = [makeFinding({ start_line: 10, end_line: 10 })];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    expect(result.pass).toBe(false);
    expect(result.precision).toBe(0);
  });

  it('excludes an un-annotated finding (overlaps neither expectation) from precision', () => {
    const expected = [
      makeExpectation({ type: 'must_find', file: 'src/example.ts', start_line: 8, end_line: 8 }),
    ];
    const raw = [
      // Matches the must_find.
      makeFinding({ start_line: 8, end_line: 8 }),
      // Grounded (overlaps the diff hunk) but overlaps no expectation at all.
      makeFinding({ start_line: 12, end_line: 12 }),
    ];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    // Only the matched must_find counts toward precision's denominator;
    // the un-annotated finding is excluded entirely (R5).
    expect(result.precision).toBe(1);
  });

  it('passes an empty-expected case when the agent emits zero findings', () => {
    const result = scoreEvalCase([], [], makeDiff());

    expect(result.pass).toBe(true);
    expect(result.precision).toBeNull();
  });

  it('fails an empty-expected case when the agent emits any grounded finding (implicit FP)', () => {
    const expected: ExpectedFinding[] = [];
    const raw = [makeFinding({ start_line: 10, end_line: 10 })];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    // A truly empty expected_output is a pure precision case (R10/G3): any
    // grounded finding at all fails it as an implicit FP, even though there
    // is no explicit must_not_flag entry to "trigger" and precision itself
    // is null (0 covered findings, since nothing was annotated) — pass is
    // decided by the expectation rule, not the (null) precision number.
    expect(result.pass).toBe(false);
    expect(result.precision).toBeNull();
  });

  it('reports recall=null when there are zero must_find expectations', () => {
    const expected = [makeExpectation({ type: 'must_not_flag' })];
    const raw: Finding[] = [];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    expect(result.recall).toBeNull();
  });

  it('computes citation_accuracy over the RAW pre-grounding set, including a dropped finding', () => {
    const expected: ExpectedFinding[] = [];
    const raw = [
      // Grounded: overlaps the hunk.
      makeFinding({ start_line: 10, end_line: 10 }),
      // Dropped: outside any hunk line (hunk covers 8-12).
      makeFinding({ start_line: 100, end_line: 100 }),
    ];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    expect(result.citation_accuracy).toBe(0.5);
  });

  it('reports citation_accuracy=null when the agent emits zero raw findings', () => {
    const result = scoreEvalCase([], [], makeDiff());

    expect(result.citation_accuracy).toBeNull();
  });

  it('reports precision=null (not 1) when there are zero covered findings', () => {
    const expected = [makeExpectation({ type: 'must_find', start_line: 8, end_line: 8 })];
    // Grounded finding present, but it overlaps neither the must_find nor
    // any must_not_flag — so covered (TP+FP) is 0.
    const raw = [makeFinding({ start_line: 12, end_line: 12 })];
    const diff = makeDiff();

    const result = scoreEvalCase(expected, raw, diff);

    expect(result.precision).toBeNull();
    // recall is unaffected: the must_find was not matched.
    expect(result.recall).toBe(0);
  });
});
