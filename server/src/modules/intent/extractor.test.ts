import { describe, it, expect, vi } from 'vitest';
import { extractHunkHeaders, buildIntentInput, callIntentLLM } from './extractor.js';
import type { LLMProvider, CompletionResult } from '@devdigest/shared';

// ---------- helpers ---------------------------------------------------------

/** Minimal stub that satisfies LLMProvider — drives complete().text only */
function makeLlm(text: string): LLMProvider {
  return {
    id: 'openai',
    listModels: vi.fn(),
    complete: vi.fn().mockResolvedValue({
      text,
      model: 'gpt-4o',
      tokensIn: 10,
      tokensOut: 10,
      costUsd: null,
    } satisfies CompletionResult),
    completeStructured: vi.fn(),
    embed: vi.fn(),
  } as unknown as LLMProvider;
}

// ---------- extractHunkHeaders ----------------------------------------------

describe('extractHunkHeaders', () => {
  it('returns only @@ lines from a multi-hunk patch', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' context',
      '-removed',
      '+added',
      ' @@ -10,3 +10,4 @@',
      ' more context',
    ].join('\n');

    const result = extractHunkHeaders(patch);
    expect(result).toEqual(['@@ -1,3 +1,4 @@']);
  });

  it('returns [] for a null patch', () => {
    expect(extractHunkHeaders(null)).toEqual([]);
  });
});

// ---------- buildIntentInput ------------------------------------------------

describe('buildIntentInput', () => {
  it('includes all sections when full args are provided', () => {
    const result = buildIntentInput({
      title: 'Add rate limiting',
      body: 'This PR adds rate limiting to the API.',
      planContent: 'The plan is to use a token bucket algorithm.',
      issue: { title: 'Rate limiting needed', body: 'We need rate limiting.' },
      files: [{ path: 'src/middleware/rateLimit.ts', patch: null }],
    });

    expect(result).toContain('Add rate limiting');
    expect(result).toContain('This PR adds rate limiting to the API.');
    expect(result).toContain('The plan is to use a token bucket algorithm.');
    expect(result).toContain('Rate limiting needed');
    expect(result).toContain('src/middleware/rateLimit.ts');
  });

  it('omits body, plan, and issue sections when they are null', () => {
    const result = buildIntentInput({
      title: 'Add rate limiting',
      body: null,
      planContent: null,
      issue: null,
      files: [{ path: 'src/middleware/rateLimit.ts', patch: null }],
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Add rate limiting');
    expect(result).toContain('src/middleware/rateLimit.ts');
    expect(result).not.toContain('PR Body:');
    expect(result).not.toContain('Plan / Specification:');
    expect(result).not.toContain('Linked Issue:');
  });

  it('includes Plan / Specification section when planContent is set', () => {
    const result = buildIntentInput({
      title: 'Add rate limiting',
      body: null,
      planContent: 'Token bucket strategy.',
      issue: null,
      files: [],
    });

    expect(result).toContain('Plan / Specification:');
    expect(result).toContain('Token bucket strategy.');
  });

  it('includes @@ hunk header lines but NOT patch body content lines', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' context line',
      '+added line',
      '-removed line',
    ].join('\n');

    const result = buildIntentInput({
      title: 'Add rate limiting',
      body: null,
      planContent: null,
      issue: null,
      files: [{ path: 'src/index.ts', patch }],
    });

    expect(result).toContain('@@ -1,3 +1,4 @@');
    expect(result).not.toContain('+added line');
  });
});

// ---------- callIntentLLM ---------------------------------------------------

describe('callIntentLLM', () => {
  it('parses intent from valid JSON with preamble text', async () => {
    const json = JSON.stringify({
      intent: 'Adds rate limiting',
      in_scope: ['rate limiting'],
      out_of_scope: ['auth'],
    });
    const llm = makeLlm('Here is the intent:\n' + json);

    const result = await callIntentLLM('some input', llm, 'gpt-4.1');

    expect(result.intent.intent).toBe('Adds rate limiting');
    expect(result.intent.in_scope).toEqual(['rate limiting']);
    expect(result.intent.out_of_scope).toEqual(['auth']);
    expect(result.tokensIn).toBeGreaterThan(0);
  });

  it('returns safe default and does not throw when LLM returns garbage', async () => {
    const llm = makeLlm('not json at all');

    await expect(callIntentLLM('input', llm, 'gpt-4.1')).resolves.toMatchObject({
      intent: { intent: '', in_scope: [], out_of_scope: [] },
    });
  });
});
