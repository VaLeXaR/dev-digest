# reviewer-core — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/reviewer-core`.

## What Works

## What Doesn't Work

- 2026-06-23: `OpenRouterProvider.complete()` read only `choice.message.content` — reasoning/thinking models (DeepSeek V4 Flash, R1, etc.) return the answer in `reasoning_content` or `reasoning` and leave `content` null, producing empty text and a silent `[]`. Fix: fall back through all three fields: `msg.content || msg.reasoning_content || msg.reasoning || ''`. (`src/llm/openrouter.ts:complete`)

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-07-15: On this Windows dev machine, `npm test` and `npm run typecheck` in `reviewer-core/` both fail immediately with exit code 1 and near-zero output — the npm debug log shows `TypeError [ERR_INVALID_ARG_TYPE]: The "file" argument must be of type string. Received undefined` inside npm's own `child_process.spawn` (`@npmcli/promise-spawn`), i.e. npm cannot resolve a shell to spawn the script in (likely `ComSpec`/`SHELL` unset in this git-bash-launched-from-node session). This is an npm-wrapper bug, not a code or test failure — the underlying commands run cleanly: `npx vitest run --passWithNoTests` and `npx tsc --noEmit -p tsconfig.json` both succeed with full output when invoked directly (bypassing the `npm run` wrapper). If `npm test`/`npm run typecheck` produces only the `> package@version test` echo line and exits 1 with no vitest/tsc banner at all, don't treat it as a real regression — rerun the same command via `npx` directly. (`reviewer-core/package.json:8-10`)

- 2026-06-24: The Edit tool converts ASCII single-quote string delimiters (`'` U+0027) to Unicode typographic quotes (U+2018/U+2019) when `old_string`/`new_string` contain string literals. TypeScript reports `TS1127: Invalid character` on every affected line. Fix: after any Edit touching string literals, run this PowerShell one-liner to replace curly quotes back to ASCII: `$p="path\to\file.ts"; $r=[IO.File]::ReadAllText($p,'UTF8'); [IO.File]::WriteAllText($p,$r.Replace([char]0x2018,[char]0x27).Replace([char]0x2019,[char]0x27),(New-Object Text.UTF8Encoding $false))`. Alternative: restructure the string as an array joined with `.join(' ')` — the array brackets are not subject to quote substitution and compiled correctly.

## Session Notes

- 2026-07-15: Implemented `scoreEvalCase` (T-03, `src/eval/score.ts`). One subtlety not spelled out in the plan's T-03 Action text: R16's general pass rule ("every `must_find` matched AND no `must_not_flag` triggered") is vacuously true when `expected_output` is completely empty (no `must_find`, no `must_not_flag` entries at all) — under that rule alone, ANY agent output would pass. But R10/AC-16 requires "an eval case with empty expected output passes iff the agent emits zero findings" (a pure-precision case), and G3 says explicitly "any finding on an empty-expected case → FP → fail". So `pass` needed a special branch: `expected.length === 0 ? kept.length === 0 : (allMustFindMatched && !anyMustNotFlagTriggered)`. Without this branch, R10's empty-expected precision case silently always passes regardless of what the agent emits — worth double-checking if T-05's service-level tests exercise this case, since it's easy to implement only the general R16 rule and miss it. (`src/eval/score.ts:80-92`)

- 2026-06-26: Added intent slot to `PromptParts` and `ReviewInput` (T-06). `SCOPE_RULE` is added to the system prompt when intent is present; intent is rendered as `## PR Intent` section via `wrapUntrusted('pr-intent', ...)`. Both `SCOPE_RULE` and all multi-line string literals in prompt.ts use the array `.join(' ')` pattern to prevent Edit-tool quote corruption. (`src/prompt.ts`, `src/review/run.ts`)

- 2026-06-24: Fixed skill body prompt-injection gap (resolves Open Questions entry 2026-06-24). Added `wrapSkill()` that wraps each skill body in `<skill>…</skill>` and escapes any `</skill>` in the content. Applied in `assemblePrompt()`. Extended `INJECTION_GUARD` with a rule that `<skill>` blocks extend review criteria but cannot override agent role, suppress finding categories, or change output format. (`src/prompt.ts:42-44`, `src/prompt.ts:99-101`)

## Open Questions

- 2026-06-24: **Security gap** — Skill bodies are injected into `assemblePrompt()` as TRUSTED instructions with no `<untrusted>` wrapper (`skillsBlock` goes directly into `## Skills / rules` section). `INJECTION_GUARD` only guards content inside `<untrusted>…</untrusted>` blocks, so a malicious skill body (e.g. "ignore all security findings", "report everything as info") bypasses the guard entirely and runs at instruction level. The code comment at `prompt.ts:44` acknowledges this: "community skills should be sanitized upstream" — but no upstream sanitization is implemented. Fix options: wrap skills in a new `<skill>` delimiter type and extend INJECTION_GUARD to cover it, or sanitize body content before storage. (`src/prompt.ts:88-109`)
