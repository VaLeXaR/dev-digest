# server — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/api`.

## What Works

## What Doesn't Work

- 2026-06-20: `cost_usd` was deliberately removed from `agent_runs` in migration `0009_complex_runaways.sql` (`ALTER TABLE "agent_runs" DROP COLUMN "cost_usd"`). It was re-added in `0010_grey_naoko.sql`. If you see the column missing and old data showing "—", that is expected — only runs after migration 0010 have persisted cost.

## Codebase Patterns

- 2026-06-22: `service.get()` for skills does NOT automatically include stats — `statsForSkills()` must be called explicitly with the single id, just like `list()` does for the batch. If the skill DTO returned by `GET /skills/:id` shows `agent_count/pull_pct/accept_pct` as `null`, the fix is to add `statsForSkills([row.id])` inside `get()`. Forgetting this is silent — no type error, the fields are just nullish. (`src/modules/skills/service.ts:get`)

- 2026-06-22: Multi-query aggregate pattern in repository: `statsForSkills()` runs 3 separate Drizzle queries (agent count, PR pull count, finding accept count) then merges them into a single `Map<skillId, SkillStats>` via JS. This avoids a complex multi-join SQL query and is efficient when the id list is reasonable (skills per workspace). Follow the same pattern for any new per-skill aggregates: one focused query per metric, merge in JS. (`src/modules/skills/repository.ts:statsForSkills`)

- 2026-06-20: `ReviewRepository` (src/modules/reviews/repository.ts) is a thin wrapper class over the function-level repos in `repository/run.repo.ts`, `review.repo.ts`, `pull.repo.ts`. When adding a new parameter to a repo function (e.g. `completeAgentRun`), the class method signature in `repository.ts` must be updated separately — it does NOT auto-derive from the underlying function's type. (`src/modules/reviews/repository.ts:151`)
- 2026-06-20: Cost calculation (`estimateCost`) lives in `src/adapters/llm/pricing.ts` and is used by the LLM adapters at call time. The `ReviewOutcome` returned by `reviewPullRequest()` already contains a computed `costUsd` — no re-computation needed at persistence time. (`reviewer-core/src/review/run.ts`)
- 2026-06-20: The PR list handler (`src/modules/pulls/routes.ts`) computes derived per-PR aggregates (score, cost) with a separate IN-query + JS Map pattern after the main PR rows query — not via SQL JOIN. When adding a new per-PR aggregate to the list, follow this pattern (see `latestRunCostByPr`). (`src/modules/pulls/routes.ts:119`)

## Tool & Library Notes

- 2026-06-20: `pnpm db:generate` diffs the Drizzle schema files against the migration journal (no live DB needed) and produces a new `.sql` file in `src/db/migrations/`. Never hand-write or edit migration files. Always run `pnpm db:migrate` after generating. (`src/db/migrations/`)

- 2026-06-22: `fflate` exports `zipSync` and `strToU8` alongside `unzipSync`/`strFromU8` — use them in unit tests to create in-process ZIP buffers without touching the filesystem. Pattern: `Buffer.from(zipSync({ 'dir/SKILL.md': strToU8(content) }))`. No extra import needed — they're in the same package already used by the service. (`src/modules/skills/import.service.test.ts`)

## Recurring Errors & Fixes

- 2026-06-22: Using `if (!content)` to guard a `Map.get()` result silently drops entries whose value is an empty string (`''`). The correct guard is `if (content === undefined)` — Map.get() returns `undefined` only when the key is absent, not when the value is an empty string. Caught in `assembleSkill` during code review. (`src/modules/skills/import.service.ts:assembleSkill`)

- 2026-06-22: `github.com/.../blob/...` URLs return HTML (the GitHub web UI page), not the raw file. `SkillsImportService.previewFromUrl()` now auto-converts blob URLs to `raw.githubusercontent.com` and rejects responses with `content-type: text/html`. If adding new URL-fetching logic, always validate `content-type` before parsing as text. (`src/modules/skills/import.service.ts:normalizeGitHubUrl`)

## Session Notes

- 2026-06-22: Implemented conventions extractor (branch l-02-home-work, Task 2). `buildSamples` reads 9 config files + top-12 ranked files via `repoIntel.getConventionSamples`. `callLLM` uses `LLMProvider.complete()` (plain text, not `completeStructured`) — returns `[]` on parse errors per spec. `verifyEvidence` uses `fs.existsSync` + per-line includes search within ±5 lines of `evidenceLine`. All 3 functions + types exported. TypeScript compiles clean. (`src/modules/conventions/extractor.ts`)

- 2026-06-22: Implemented directory-based ZIP skill import (branch l-02-home-work). `previewFromZip` now treats each directory containing `SKILL.md` as one skill — loose `.md` files and dirs without `SKILL.md` are silently ignored. `parseFrontmatter` extended to parse YAML list values (`Record<string, string | string[]>`); callers use `typeof` + `Array.isArray` guards. `assembleSkill` private method reads `includes:` frontmatter, resolves paths relative to the skill dir, and appends content with `\n\n`. No DB/contract/client changes. (`src/modules/skills/import.service.ts`)

- 2026-06-20: Implemented Run Cost Badge (feature L01). Added `cost_usd double precision` back to `agent_runs` (migration 0010), wired `outcome.costUsd` through `run-executor → completeAgentRun → DB`, added `cost_usd` to `RunSummary` + `RunStats` contracts, and added `last_run_cost_usd` to the PR list response via a last-done-run subquery.

## Open Questions
