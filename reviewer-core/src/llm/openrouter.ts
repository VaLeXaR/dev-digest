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

/**
 * Prompt size (chars) below which a request keeps the flat base deadline. Small
 * calls should still fail fast on a stalled upstream, so only prompts big enough
 * to plausibly need more model time earn more budget.
 */
const DEADLINE_SCALE_FROM_CHARS = 50_000;

/**
 * Extra budget per prompt char above the threshold. Measured rate on a 160K-token
 * single-pass review (~640K chars) was ~0.14ms/char; this is ~3.5x that, since the
 * budget is a stall guard rather than a target — overshooting costs nothing on a
 * healthy call (it returns when it returns) while undershooting fails it outright.
 */
const DEADLINE_MS_PER_CHAR = 0.5;

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /**
   * SDK per-request timeout (ms) for calls with no prompt to size (listModels).
   * Prompt-bearing calls override it per request with their own deadline budget
   * — see `deadlineFor`, which is the single wall-clock authority there.
   */
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * BASE wall-clock cap (ms) on a SINGLE upstream request, enforced via an
   * AbortController and RESET for each parse-repair iteration (default 120_000).
   * It bounds the SDK's own timeout × `maxRetries` stacking so a hung provider
   * fails fast.
   *
   * This is the budget for a SMALL prompt. Above `DEADLINE_SCALE_FROM_CHARS` the
   * budget grows with prompt size (`deadlineFor`) up to `maxRequestDeadlineMs`,
   * because a big single-pass review legitimately needs longer to generate: a
   * 160K-token diff measured 88s of model time, which a flat 120s budget clears
   * by under two seconds. A stall guard must sit far above the healthy time it
   * is guarding, or it stops being a guard and becomes the failure.
   *
   * Scoped per-request, NOT across the whole call, so a legitimately slow review
   * — including one that needs a JSON-repair round — is never cut: every real
   * response resets the clock, and only a genuinely stalled request (no bytes
   * for the budget) trips it.
   */
  requestDeadlineMs?: number;
  /** Ceiling (ms) on the size-scaled budget above (default 600_000). */
  maxRequestDeadlineMs?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private requestDeadlineMs: number;
  private maxRequestDeadlineMs: number;
  private estimateCost?: OpenRouterProviderOptions['estimateCost'];

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.requestDeadlineMs = opts.requestDeadlineMs ?? 120_000;
    this.maxRequestDeadlineMs = opts.maxRequestDeadlineMs ?? 600_000;
    this.estimateCost = opts.estimateCost;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  /**
   * Wall-clock budget for ONE upstream request carrying `messages`, scaled by
   * prompt size (see DEADLINE_SCALE_FROM_CHARS / DEADLINE_MS_PER_CHAR).
   *
   * Callers pass the result as BOTH the AbortController deadline and the SDK's
   * per-request `timeout`, deliberately: an SDK timeout below the deadline would
   * abort a healthy-but-slow call and retry it from scratch, and the retry is
   * just as slow, so it burns the deadline and can never succeed. Retrying a slow
   * request is pointless; retrying a 429/5xx is not, and those still reject fast
   * enough for `maxRetries` to do its job.
   */
  private deadlineFor(messages: unknown): number {
    const chars = JSON.stringify(messages).length;
    if (chars <= DEADLINE_SCALE_FROM_CHARS) return this.requestDeadlineMs;
    const scaled =
      this.requestDeadlineMs + Math.round((chars - DEADLINE_SCALE_FROM_CHARS) * DEADLINE_MS_PER_CHAR);
    return Math.min(scaled, this.maxRequestDeadlineMs);
  }

  /**
   * One AbortController-backed deadline for a SINGLE upstream request, capping
   * its wall-clock (including the SDK's own timeout + internal retries) at
   * `budgetMs`. Started fresh per parse-repair iteration so a repair round never
   * inherits a spent budget. `done()` MUST run (finally) to clear the timer.
   */
  private startDeadline(budgetMs: number): {
    signal: AbortSignal;
    done: () => void;
    expired: () => boolean;
  } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
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
      // Sized from the CURRENT messages: a repair round carries the prior raw
      // output too, so its budget grows with it rather than being cut short.
      const budgetMs = this.deadlineFor(messages);
      const deadline = this.startDeadline(budgetMs);
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
          { signal: deadline.signal, timeout: budgetMs },
        );
      } catch (err) {
        // Distinguish "we hit our own deadline" from a genuine SDK error so the
        // caller (eval/review run) records a clear timeout, not a vague abort.
        if (deadline.expired()) {
          throw new Error(
            `OpenRouter request for ${req.schemaName} exceeded the ${budgetMs}ms deadline`,
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
    const budgetMs = this.deadlineFor(req.messages);
    const deadline = this.startDeadline(budgetMs);
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
        { signal: deadline.signal, timeout: budgetMs },
      );
    } catch (err) {
      if (deadline.expired()) {
        throw new Error(`OpenRouter completion exceeded the ${budgetMs}ms deadline`);
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
