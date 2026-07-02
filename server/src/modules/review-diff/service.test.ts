import { describe, it, expect } from 'vitest';
import type { Review } from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { ValidationError } from '../../platform/errors.js';
import { reviewWorkingDiff } from './service.js';

/**
 * Hermetic unit tests for the pure `reviewWorkingDiff` diff→Review path — no
 * DB, no Docker (agent resolution is exercised separately by the .it.test in
 * T-04). The MockLLMProvider fixture must cite a `start_line` that intersects
 * a real hunk in SAMPLE_DIFF, or the citation-grounding gate silently drops
 * it (server/INSIGHTS.md gotcha).
 */

// new-side line numbers covered by the single hunk below: 1 (context), 2
// (addition), 3 (context), 4 (context) — matches "@@ -1,3 +1,4 @@".
const SAMPLE_DIFF = [
  'diff --git a/src/greet.ts b/src/greet.ts',
  '--- a/src/greet.ts',
  '+++ b/src/greet.ts',
  '@@ -1,3 +1,4 @@',
  ' export function greet(name) {',
  "+  if (!name) throw new Error('name required');",
  '   return name;',
  ' }',
].join('\n');

function fixtureReview(startLine: number, endLine: number): Review {
  return {
    verdict: 'comment',
    summary: 'One suggestion: guard against empty name.',
    score: 50, // deliberately different from the recomputed score below
    findings: [
      {
        id: 'f1',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Guard against empty name',
        file: 'src/greet.ts',
        start_line: startLine,
        end_line: endLine,
        rationale: 'Throwing early avoids returning "Hello, undefined".',
        suggestion: null,
        confidence: 0.8,
      },
    ],
  };
}

describe('reviewWorkingDiff', () => {
  it('keeps a finding whose start_line intersects a real diff hunk', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview(2, 2) });

    const review = await reviewWorkingDiff({
      systemPrompt: 'You are a reviewer.',
      model: 'gpt-4.1-mini',
      rawDiff: SAMPLE_DIFF,
      llm,
    });

    expect(review.verdict).toBe('comment');
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0]?.title).toBe('Guard against empty name');
    // Score is recomputed from the surviving findings (not passed through
    // from the fixture's raw score) — one SUGGESTION = 100 - 3 penalty
    // (reviewer-core/src/review/reduce.ts:SEVERITY_PENALTY).
    expect(review.score).toBe(97);
  });

  it('drops a finding whose start_line does not intersect any diff hunk', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview(50, 50) });

    const review = await reviewWorkingDiff({
      systemPrompt: 'You are a reviewer.',
      model: 'gpt-4.1-mini',
      rawDiff: SAMPLE_DIFF,
      llm,
    });

    expect(review.findings).toHaveLength(0);
  });

  it('rejects an empty/malformed diff with ValidationError', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview(2, 2) });

    await expect(
      reviewWorkingDiff({
        systemPrompt: 'You are a reviewer.',
        model: 'gpt-4.1-mini',
        rawDiff: '',
        llm,
      }),
    ).rejects.toThrow(ValidationError);
  });
});
