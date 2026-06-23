# reviewer-core — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/reviewer-core`.

## What Works

## What Doesn't Work

- 2026-06-23: `OpenRouterProvider.complete()` read only `choice.message.content` — reasoning/thinking models (DeepSeek V4 Flash, R1, etc.) return the answer in `reasoning_content` or `reasoning` and leave `content` null, producing empty text and a silent `[]`. Fix: fall back through all three fields: `msg.content || msg.reasoning_content || msg.reasoning || ''`. (`src/llm/openrouter.ts:complete`)

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
