import OpenAI from 'openai';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from './structured.js';

/**
 * The single OpenAI-compatible structured provider, owned by the engine because
 * BOTH consumers need it: the CI runner (the GitHub Action runs reviewer-core
 * directly) and the studio server's openrouter path. Centralizing it here means
 * session grouping, the no-choices guard, request timeouts, and the
 * parse-with-repair loop live in ONE place instead of being duplicated.
 *
 * OpenRouter is OpenAI-compatible, so we drive it with the OpenAI SDK pointed at
 * its baseURL. Only completeStructured is needed by reviewPullRequest; the rest
 * are stubs. Cost attribution is INJECTED (`estimateCost`) so the engine stays
 * free of a pricing table — the server passes its own, the runner passes none.
 */

const NOT_SUPPORTED = 'OpenRouterProvider only implements completeStructured';

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /** Per-request timeout (ms) — the SDK retries on timeout/5xx/429 with backoff. */
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Hard wall-clock cap (ms) on a SINGLE upstream request, enforced via an
   * AbortController and RESET for each parse-repair iteration (default 120_000).
   * It bounds the SDK's own per-request `timeoutMs` × `maxRetries` stacking
   * (e.g. 90s × 3 = 270s on a stalled upstream) so a hung provider fails fast.
   *
   * Scoped per-request, NOT across the whole call, so a legitimately slow review
   * — including one that needs a JSON-repair round — is never cut: every real
   * response resets the clock, and only a genuinely stalled request (no bytes
   * for `requestDeadlineMs`) trips it. Because a normal call already returns
   * inside the SDK's 90s `timeoutMs`, the default 120s never fires on a healthy
   * request; it exists solely to stop a dead connection from stacking to minutes.
   */
  requestDeadlineMs?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private requestDeadlineMs: number;
  private estimateCost?: OpenRouterProviderOptions['estimateCost'];

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.requestDeadlineMs = opts.requestDeadlineMs ?? 120_000;
    this.estimateCost = opts.estimateCost;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  /**
   * One AbortController-backed deadline for a SINGLE upstream request, capping
   * its wall-clock (including the SDK's own per-request timeout + internal
   * retries) at `requestDeadlineMs`. Started fresh per parse-repair iteration so
   * a repair round never inherits a spent budget. `done()` MUST run (finally) to
   * clear the timer.
   */
  private startDeadline(): { signal: AbortSignal; done: () => void; expired: () => boolean } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestDeadlineMs);
    // Node keeps the event loop alive for pending timers — don't let this one
    // hold the process open if everything else has finished.
    (timer as { unref?: () => void }).unref?.();
    return {
      signal: controller.signal,
      done: () => clearTimeout(timer),
      expired: () => controller.signal.aborted,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let costFromApi: number | null = null;
    let lastRaw = '';

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      // Fresh per-request deadline each iteration — a repair round gets its own
      // full budget rather than inheriting the previous attempt's spent time.
      const deadline = this.startDeadline();
      let res;
      try {
        res = await this.client.chat.completions.create(
          {
            model: req.model,
            messages,
            temperature: req.temperature ?? 0,
            ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
            },
            // OpenRouter session grouping — extra body field (spread is exempt from
            // excess-property checks). Only sent when talking to OpenRouter.
            ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
            // OpenRouter usage accounting — ask it to return the REAL generation
            // cost (USD) in `usage.cost`, instead of estimating from a price book.
            ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
          },
          { signal: deadline.signal },
        );
      } catch (err) {
        // Distinguish "we hit our own deadline" from a genuine SDK error so the
        // caller (eval/review run) records a clear timeout, not a vague abort.
        if (deadline.expired()) {
          throw new Error(
            `OpenRouter request for ${req.schemaName} exceeded the ${this.requestDeadlineMs}ms deadline`,
          );
        }
        throw err;
      } finally {
        deadline.done();
      }

      // OpenRouter can return HTTP 200 with no `choices` (an upstream provider
      // error / moderation / free-tier limit in the body) — surface it.
      const choice = res.choices?.[0];
      if (!choice) {
        const errMsg = (res as unknown as { error?: { message?: string } }).error?.message;
        throw new Error(`OpenRouter returned no choices for ${req.schemaName}${errMsg ? `: ${errMsg}` : ''}`);
      }
      lastRaw = choice.message?.content ?? '';
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      // `usage.cost` is an OpenRouter extension (USD), absent from the OpenAI SDK type.
      const apiCost = (res.usage as { cost?: number } | null | undefined)?.cost;
      if (typeof apiCost === 'number') costFromApi = (costFromApi ?? 0) + apiCost;

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: costFromApi ?? this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null,
          raw: lastRaw,
          attempts: attempt,
        };
      }
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }
    throw new Error(`OpenRouter structured output failed schema validation for ${req.schemaName}`);
  }

  /**
   * List models with pricing from the OpenRouter `/models` endpoint (the OpenAI
   * SDK's models.list strips the `pricing` field, so we fetch raw). Prices are
   * converted from per-token to USD per 1M tokens; cheapest output first.
   */
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseURL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      // Bound the raw fetch — unlike the SDK calls, a plain fetch has no timeout
      // and would hang the model-list dropdown indefinitely on a stalled endpoint.
      signal: AbortSignal.timeout(this.requestDeadlineMs),
    });
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ModelInfo[] = (json.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      // OpenRouter uses -1 as a sentinel for variable-priced router pseudo-models
      // (openrouter/auto etc.) — treat negatives as "unknown" so they don't show
      // as $-1000000 and don't sort to the top of the cheapest list.
      const pricing =
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { promptPerM: prompt * 1_000_000, completionPerM: completion * 1_000_000 }
          : null;
      return {
        id: m.id,
        provider: 'openrouter' as const,
        label: m.name ?? null,
        pricing,
        contextLength: m.context_length ?? null,
      };
    });
    return models.sort(
      (a, b) => (a.pricing?.completionPerM ?? Infinity) - (b.pricing?.completionPerM ?? Infinity),
    );
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const deadline = this.startDeadline();
    let res;
    try {
      res = await this.client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
          ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
        },
        { signal: deadline.signal },
      );
    } catch (err) {
      if (deadline.expired()) {
        throw new Error(`OpenRouter completion exceeded the ${this.requestDeadlineMs}ms deadline`);
      }
      throw err;
    } finally {
      deadline.done();
    }

    const choice = res.choices?.[0];
    if (!choice) {
      const errMsg = (res as unknown as { error?: { message?: string } }).error?.message;
      throw new Error(`OpenRouter returned no choices${errMsg ? `: ${errMsg}` : ''}`);
    }

    // Some reasoning models (DeepSeek R1, V4 Flash, etc.) return the answer in
    // reasoning_content or reasoning when content is null — fall back in order.
    const msg = choice.message as {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
    };
    const text = msg.content || msg.reasoning_content || msg.reasoning || '';
    const tokensIn = res.usage?.prompt_tokens ?? 0;
    const tokensOut = res.usage?.completion_tokens ?? 0;
    const apiCost = (res.usage as { cost?: number } | null | undefined)?.cost;

    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: typeof apiCost === 'number' ? apiCost : (this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null),
    };
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(NOT_SUPPORTED);
  }
}
