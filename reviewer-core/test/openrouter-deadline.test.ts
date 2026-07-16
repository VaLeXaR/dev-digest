import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

/**
 * The per-request deadline guard (openrouter.ts:startDeadline) must cap a SINGLE
 * upstream request's wall-clock — a stalled upstream that never responds must
 * reject at ~requestDeadlineMs, NOT stack the SDK's per-request timeout × retries
 * into minutes (the 270s eval-run hang, 2026-07-16). It is scoped per parse-repair
 * iteration, so a legit slow-but-responding call (incl. a repair round) is never cut.
 */
describe('OpenRouterProvider per-request deadline', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** A fetch that never resolves until the caller's AbortSignal fires. */
  function hangingFetchHonoringAbort() {
    globalThis.fetch = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        sig?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof fetch;
  }

  it('completeStructured rejects at the deadline instead of hanging', async () => {
    hangingFetchHonoringAbort();
    // Tiny overall cap; SDK per-request timeout larger + no SDK retries so the
    // ONLY thing that ends the call is our AbortController deadline.
    const provider = new OpenRouterProvider('test-key', {
      requestDeadlineMs: 120,
      timeoutMs: 10_000,
      maxRetries: 0,
    });

    const start = Date.now();
    await expect(
      provider.completeStructured({
        model: 'test/model',
        schemaName: 'Thing',
        schema: z.object({ ok: z.boolean() }),
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/exceeded the 120ms deadline/);
    // Bounded well under the SDK's 10s per-request timeout — proves the deadline,
    // not the SDK timeout, ended it.
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it('complete rejects at the deadline instead of hanging', async () => {
    hangingFetchHonoringAbort();
    const provider = new OpenRouterProvider('test-key', {
      requestDeadlineMs: 120,
      timeoutMs: 10_000,
      maxRetries: 0,
    });

    await expect(
      provider.complete({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/exceeded the 120ms deadline/);
  });

  // NOTE: the deadline is created INSIDE completeStructured's parse-repair loop
  // (openrouter.ts — `const deadline = this.startDeadline()` per iteration), so a
  // legitimate slow call that needs a repair round gets a fresh budget each
  // attempt and is never cut; only a genuinely stalled single request trips it.
  // That per-iteration reset is asserted structurally rather than via a
  // wall-clock race (which is inherently flaky and SDK-internal-dependent).
});
