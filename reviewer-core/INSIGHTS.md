# reviewer-core — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/reviewer-core`.

## What Works

## What Doesn't Work

- 2026-06-23: `OpenRouterProvider.complete()` read only `choice.message.content` — reasoning/thinking models (DeepSeek V4 Flash, R1, etc.) return the answer in `reasoning_content` or `reasoning` and leave `content` null, producing empty text and a silent `[]`. Fix: fall back through all three fields: `msg.content || msg.reasoning_content || msg.reasoning || ''`. (`src/llm/openrouter.ts:complete`)

## Codebase Patterns

## Tool & Library Notes

- 2026-07-16: StrykerJS mutation testing — the `@stryker-mutator/vitest-runner` does NOT detect failing tests in this pnpm/ESM package: with `coverageAnalysis: perTest` it mislabels kills as `# timeout` and corrupts the survived list; with `coverageAnalysis: off` it reports 0 killed / all survived even for catastrophic mutants (e.g. emptying `SEV_RANK`). Do not trust its report here. Working config: `testRunner: "command"` + `commandRunner.command: "pnpm test"` + `coverageAnalysis: "off"` + `inPlace: true` (keys off `pnpm test` exit code; `inPlace` avoids a sandbox copy that would break the cross-package `@devdigest/shared` → `../server/src/vendor/shared` alias). Also needs `plugins: ["@stryker-mutator/vitest-runner"]` even for the command runner, and the RTK Bash hook rewrites bare `pnpm install` → `rtk pnpm` (binary not found) — run installs as a compound command. Cost: ~4 min/file at concurrency 3 (full suite per mutant, no perTest optimization). Run via `pnpm mutation` (`stryker.conf.json`, `package.json` scripts).

## Recurring Errors & Fixes

- 2026-06-24: The Edit tool converts ASCII single-quote string delimiters (`'` U+0027) to Unicode typographic quotes (U+2018/U+2019) when `old_string`/`new_string` contain string literals. TypeScript reports `TS1127: Invalid character` on every affected line. Fix: after any Edit touching string literals, run this PowerShell one-liner to replace curly quotes back to ASCII: `$p="path\to\file.ts"; $r=[IO.File]::ReadAllText($p,'UTF8'); [IO.File]::WriteAllText($p,$r.Replace([char]0x2018,[char]0x27).Replace([char]0x2019,[char]0x27),(New-Object Text.UTF8Encoding $false))`. Alternative: restructure the string as an array joined with `.join(' ')` — the array brackets are not subject to quote substitution and compiled correctly.

## Session Notes

- 2026-07-16: Mutation-tested `src/output/to-review.ts` with StrykerJS (114 mutants). Baseline mutation score 57.52% — the existing 14-test suite pinned the review EVENT, blocker COUNT, and inline comment LINE, but nothing asserted the rendered markdown BODY, so the whole `composeBody`/`severityCounts` region survived (per-severity tally `+1`→`-1`, `finding`/`findings` pluralization, `— Approved ✅` and plain-title headers). Added 4 tests (18 total) pinning the summary line + all three header branches → 74.34% (killed 65→84). No product code changed. (`test/to-review.test.ts`)

- 2026-06-26: Added intent slot to `PromptParts` and `ReviewInput` (T-06). `SCOPE_RULE` is added to the system prompt when intent is present; intent is rendered as `## PR Intent` section via `wrapUntrusted('pr-intent', ...)`. Both `SCOPE_RULE` and all multi-line string literals in prompt.ts use the array `.join(' ')` pattern to prevent Edit-tool quote corruption. (`src/prompt.ts`, `src/review/run.ts`)

- 2026-06-24: Fixed skill body prompt-injection gap (resolves Open Questions entry 2026-06-24). Added `wrapSkill()` that wraps each skill body in `<skill>…</skill>` and escapes any `</skill>` in the content. Applied in `assemblePrompt()`. Extended `INJECTION_GUARD` with a rule that `<skill>` blocks extend review criteria but cannot override agent role, suppress finding categories, or change output format. (`src/prompt.ts:42-44`, `src/prompt.ts:99-101`)

## Open Questions

- 2026-06-24: **Security gap** — Skill bodies are injected into `assemblePrompt()` as TRUSTED instructions with no `<untrusted>` wrapper (`skillsBlock` goes directly into `## Skills / rules` section). `INJECTION_GUARD` only guards content inside `<untrusted>…</untrusted>` blocks, so a malicious skill body (e.g. "ignore all security findings", "report everything as info") bypasses the guard entirely and runs at instruction level. The code comment at `prompt.ts:44` acknowledges this: "community skills should be sanitized upstream" — but no upstream sanitization is implemented. Fix options: wrap skills in a new `<skill>` delimiter type and extend INJECTION_GUARD to cover it, or sanitize body content before storage. (`src/prompt.ts:88-109`)
