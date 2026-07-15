import { describe, it, expect, vi } from 'vitest';
import { callWhyRiskBriefLLM } from './extractor.js';
import type { LLMProvider, CompletionResult } from '@devdigest/shared';

// ---------- helpers -----------------------------------------------------------

/** Minimal stub that satisfies LLMProvider — drives complete().text only, tracks call count. */
function makeLlm(text: string): LLMProvider {
  return {
    id: 'openai',
    listModels: vi.fn(),
    complete: vi.fn().mockResolvedValue({
      text,
      model: 'gpt-4.1',
      tokensIn: 10,
      tokensOut: 10,
      costUsd: null,
    } satisfies CompletionResult),
    completeStructured: vi.fn(),
    embed: vi.fn(),
  } as unknown as LLMProvider;
}

const VALID_PAYLOAD = {
  what: 'Adds rate limiting middleware.',
  why: 'Prevents abuse of the public API.',
  risk_level: 'medium',
  risks: [
    {
      kind: 'performance',
      title: 'Extra latency per request',
      explanation: 'The middleware adds a Redis round-trip on every call.',
      severity: 'medium',
      file_refs: ['src/middleware/rateLimit.ts'],
    },
  ],
  review_focus: [{ file: 'src/middleware/rateLimit.ts', line: 12, reason: 'New Redis dependency.' }],
};

// ---------- exactly one call ---------------------------------------------------

describe('callWhyRiskBriefLLM — call count', () => {
  it('issues exactly one llm.complete call', async () => {
    const llm = makeLlm(JSON.stringify(VALID_PAYLOAD));
    const resolvableRefs = new Set(['src/middleware/rateLimit.ts']);

    await callWhyRiskBriefLLM('some input', llm, 'gpt-4.1', resolvableRefs);

    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});

// ---------- AC-5: exactly the 5 fields -----------------------------------------

describe('callWhyRiskBriefLLM — AC-5 shape', () => {
  it('parses a valid payload to exactly the 5 WhyRiskBrief fields', async () => {
    const llm = makeLlm(JSON.stringify(VALID_PAYLOAD));
    const resolvableRefs = new Set(['src/middleware/rateLimit.ts']);

    const result = await callWhyRiskBriefLLM('some input', llm, 'gpt-4.1', resolvableRefs);

    expect(result.reason).toBeUndefined();
    expect(Object.keys(result.brief).sort()).toEqual(
      ['risk_level', 'risks', 'review_focus', 'what', 'why'].sort(),
    );
    expect(result.brief.what).toBe(VALID_PAYLOAD.what);
    expect(result.brief.why).toBe(VALID_PAYLOAD.why);
    expect(result.brief.risk_level).toBe('medium');
  });

  it('tolerates preamble text before the JSON object', async () => {
    const llm = makeLlm('Here is the brief:\n' + JSON.stringify(VALID_PAYLOAD));
    const resolvableRefs = new Set(['src/middleware/rateLimit.ts']);

    const result = await callWhyRiskBriefLLM('some input', llm, 'gpt-4.1', resolvableRefs);

    expect(result.reason).toBeUndefined();
    expect(result.brief.what).toBe(VALID_PAYLOAD.what);
  });
});

// ---------- AC-6 + AC-18: reference resolution ---------------------------------

describe('callWhyRiskBriefLLM — AC-6 / AC-18 reference resolution', () => {
  it('drops an unresolvable review_focus item and an unresolvable risk file_ref, but retains the risk with empty file_refs', async () => {
    const payload = {
      what: 'Adds rate limiting middleware.',
      why: 'Prevents abuse of the public API.',
      risk_level: 'high',
      risks: [
        {
          kind: 'security',
          title: 'Unvalidated header',
          explanation: 'A risk whose only file_ref does not exist in the assembled input.',
          severity: 'high',
          file_refs: ['src/nonexistent/ghost.ts'],
        },
        {
          kind: 'performance',
          title: 'Extra latency per request',
          explanation: 'The middleware adds a Redis round-trip on every call.',
          severity: 'medium',
          file_refs: ['src/middleware/rateLimit.ts', 'src/nonexistent/ghost.ts'],
        },
      ],
      review_focus: [
        { file: 'src/middleware/rateLimit.ts', line: 12, reason: 'New Redis dependency.' },
        { file: 'src/nonexistent/ghost.ts', line: 1, reason: 'Should be dropped.' },
      ],
    };
    const llm = makeLlm(JSON.stringify(payload));
    // Only rateLimit.ts is present in the assembled input — ghost.ts is not.
    const resolvableRefs = new Set(['src/middleware/rateLimit.ts']);

    const result = await callWhyRiskBriefLLM('some input', llm, 'gpt-4.1', resolvableRefs);

    expect(result.reason).toBeUndefined();

    // AC-6: unresolvable review_focus item dropped.
    expect(result.brief.review_focus).toHaveLength(1);
    expect(result.brief.review_focus[0]?.file).toBe('src/middleware/rateLimit.ts');

    // AC-18: risk with ALL refs unresolvable is RETAINED, with file_refs: [].
    expect(result.brief.risks).toHaveLength(2);
    const ghostRisk = result.brief.risks.find((r) => r.title === 'Unvalidated header');
    expect(ghostRisk).toBeDefined();
    expect(ghostRisk?.file_refs).toEqual([]);
    expect(ghostRisk?.explanation).toBe('A risk whose only file_ref does not exist in the assembled input.');
    expect(ghostRisk?.severity).toBe('high');

    // AC-6: unresolvable ref within a partially-resolvable risk is filtered, resolvable one kept.
    const latencyRisk = result.brief.risks.find((r) => r.title === 'Extra latency per request');
    expect(latencyRisk?.file_refs).toEqual(['src/middleware/rateLimit.ts']);
  });
});

// ---------- AC-8: safe default on failure, no throw -----------------------------

describe('callWhyRiskBriefLLM — AC-8 safe default', () => {
  it('returns the deterministic empty brief with a reason on empty response text', async () => {
    const llm = makeLlm('');
    const result = await callWhyRiskBriefLLM('input', llm, 'gpt-4.1', new Set());

    expect(result.brief).toEqual({ what: '', why: '', risk_level: 'low', risks: [], review_focus: [] });
    expect(result.reason).toBeTruthy();
  });

  it('returns the deterministic empty brief with a reason when no JSON braces are present', async () => {
    const llm = makeLlm('sorry, I cannot help with that');
    const result = await callWhyRiskBriefLLM('input', llm, 'gpt-4.1', new Set());

    expect(result.brief).toEqual({ what: '', why: '', risk_level: 'low', risks: [], review_focus: [] });
    expect(result.reason).toBeTruthy();
  });

  it('returns the deterministic empty brief with a reason on JSON.parse failure', async () => {
    const llm = makeLlm('{ this is not valid json ]');
    const result = await callWhyRiskBriefLLM('input', llm, 'gpt-4.1', new Set());

    expect(result.brief).toEqual({ what: '', why: '', risk_level: 'low', risks: [], review_focus: [] });
    expect(result.reason).toBeTruthy();
  });

  it('returns the deterministic empty brief with a reason when the payload fails safeParse (missing fields)', async () => {
    const llm = makeLlm(JSON.stringify({ what: 'Adds rate limiting middleware.' }));
    const result = await callWhyRiskBriefLLM('input', llm, 'gpt-4.1', new Set());

    expect(result.brief).toEqual({ what: '', why: '', risk_level: 'low', risks: [], review_focus: [] });
    expect(result.reason).toBeTruthy();
  });

  it('never throws even on malformed input', async () => {
    const llm = makeLlm('not json at all, no braces here');
    await expect(callWhyRiskBriefLLM('input', llm, 'gpt-4.1', new Set())).resolves.toBeDefined();
  });
});
