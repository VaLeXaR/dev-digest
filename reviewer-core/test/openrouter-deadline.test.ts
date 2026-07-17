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

  /**
   * A big single-pass review is slow but HEALTHY (a 160K-token diff measured 88s
   * of model time, vs a flat 120s budget). These pin the two halves of the fix:
   * the budget must grow with the prompt, and the SDK's own timeout must never
   * sit below it — a lower SDK timeout aborts the slow-but-fine call and retries
   * it just as slowly, which is what made large PRs unreviewable.
   */
  describe('size-scaled budget', () => {
    /**
     * The budget is observed through the RequestOptions handed to the SDK rather
     * than by racing a real timer: `timeout` and the AbortController deadline are
     * set from the SAME value, so asserting it is exact, instant, and free of the
     * wall-clock flake a multi-second budget would otherwise need.
     */
    function budgetHandedToSdk(provider: OpenRouterProvider, content: string): Promise<number> {
      let seen: number | undefined;
      vi.spyOn(
        (provider as unknown as { client: { chat: { completions: { create: unknown } } } }).client
          .chat.completions,
        'create',
      ).mockImplementation((_body: unknown, opts: { timeout?: number }) => {
        seen = opts?.timeout;
        return Promise.reject(new Error('stop here'));
      });
      return provider
        .complete({ model: 'test/model', messages: [{ role: 'user', content }] })
        .then(
          () => {
            throw new Error('expected the mocked create to reject');
          },
          () => seen as number,
        );
    }

    it('keeps the flat base budget for a small prompt', async () => {
      const provider = new OpenRouterProvider('test-key', { requestDeadlineMs: 100 });
      expect(await budgetHandedToSdk(provider, 'hi')).toBe(100);
    });

    it('grows the budget for a large prompt instead of failing it', async () => {
      const provider = new OpenRouterProvider('test-key', { requestDeadlineMs: 100 });
      // 60_000 content chars → 60_030 once JSON-wrapped, i.e. 10_030 over the
      // 50_000 threshold: 100 + round(10_030 * 0.5) = 5_115ms, not the 100ms base.
      expect(await budgetHandedToSdk(provider, 'x'.repeat(60_000))).toBe(5_115);
    });

    it('caps the grown budget at maxRequestDeadlineMs', async () => {
      const provider = new OpenRouterProvider('test-key', {
        requestDeadlineMs: 100,
        maxRequestDeadlineMs: 2_000,
      });
      expect(await budgetHandedToSdk(provider, 'x'.repeat(500_000))).toBe(2_000);
    });

    it('never hands the SDK a timeout below the budget', async () => {
      // The regression that made large PRs unreviewable: client timeout 90s sat
      // BELOW the 120s deadline, so the SDK pre-empted a healthy 88s call and
      // retried it — just as slowly — until the deadline killed the whole review.
      const provider = new OpenRouterProvider('test-key', {
        requestDeadlineMs: 100,
        timeoutMs: 50, // deliberately below the budget — must not be what's used
      });
      expect(await budgetHandedToSdk(provider, 'x'.repeat(60_000))).toBe(5_115);
    });
  });
});
