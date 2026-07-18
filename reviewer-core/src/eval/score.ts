import type { ExpectedFinding, Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings } from '../grounding.js';

/**
 * scoreEvalCase — pure, zero-LLM scoring of one eval case's raw agent output
 * against its expected findings.
 *
 * All three metrics follow the uniform "0/0 -> null, excluded from any
 * run-level aggregate" policy (G1-G3):
 *  - citation_accuracy: kept / (kept + dropped) from groundFindings, measured
 *    over the RAW pre-grounding findings; null when rawFindings is empty.
 *  - recall / precision: measured over the GROUNDED (kept) findings only; a
 *    dropped (ungrounded) finding never satisfies a must_find nor counts as a
 *    precision false positive — citation_accuracy is the sole metric that
 *    penalises ungrounded output.
 *
 * `pass` is a boolean expectation rule (every must_find matched AND no
 * must_not_flag triggered) — it is never derived from the precision number,
 * so an empty-expected case still passes/fails correctly even though its
 * precision is null when the agent emits nothing.
 */
export interface EvalScore {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  pass: boolean;
}

/**
 * Mirrors `rangeIntersects` in `../grounding.ts` exactly: true when the
 * inclusive [start,end] ranges overlap at at least one line. Not imported
 * because grounding.ts's version is a private (non-exported) module helper.
 */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

function matchesExpectation(finding: Finding, expectation: ExpectedFinding): boolean {
  return (
    finding.file === expectation.file &&
    overlaps(finding.start_line, finding.end_line, expectation.start_line, expectation.end_line)
  );
}

export function scoreEvalCase(
  expected: ExpectedFinding[],
  rawFindings: Finding[],
  diff: UnifiedDiff,
): EvalScore {
  const { kept, dropped } = groundFindings(rawFindings, diff);

  const citation_accuracy =
    rawFindings.length === 0 ? null : kept.length / (kept.length + dropped.length);

  const mustFind = expected.filter((e) => e.type === 'must_find');
  const mustNotFlag = expected.filter((e) => e.type === 'must_not_flag');

  const matchedMustFind = mustFind.filter((expectation) =>
    kept.some((finding) => matchesExpectation(finding, expectation)),
  );
  const recall = mustFind.length === 0 ? null : matchedMustFind.length / mustFind.length;

  let truePositives = 0;
  let falsePositives = 0;
  for (const finding of kept) {
    const isTruePositive = mustFind.some((expectation) => matchesExpectation(finding, expectation));
    const isFalsePositive = mustNotFlag.some((expectation) =>
      matchesExpectation(finding, expectation),
    );
    if (isTruePositive) truePositives += 1;
    if (isFalsePositive) falsePositives += 1;
  }
  const covered = truePositives + falsePositives;
  const precision = covered === 0 ? null : truePositives / covered;

  const allMustFindMatched = matchedMustFind.length === mustFind.length;
  const anyMustNotFlagTriggered = mustNotFlag.some((expectation) =>
    kept.some((finding) => matchesExpectation(finding, expectation)),
  );
  // R10/AC-16/G3: a case with a TRULY empty expected_output (no must_find and
  // no must_not_flag at all) is a pure precision case — it passes only when
  // the agent emits zero grounded findings. Any grounded finding at all is
  // an implicit FP in that special case. This is decided by the expectation
  // rule, never by the (null, since 0 covered) precision number.
  const pass =
    expected.length === 0
      ? kept.length === 0
      : allMustFindMatched && !anyMustNotFlagTriggered;

  return { recall, precision, citation_accuracy, pass };
}
