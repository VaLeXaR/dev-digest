# server — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/api`.

## What Works

## What Doesn't Work

- 2026-06-22: For LLM extraction tasks that must return `[]` on parse errors (not throw), use `llm.complete()` — NOT `llm.completeStructured()`. `completeStructured()` throws a validation error when the model response doesn't match the schema, which breaks the `[]`-on-error contract. `complete()` returns raw text and lets you catch `JSON.parse` failures yourself. (`src/modules/conventions/extractor.ts:callLLM`)

- 2026-06-20: `cost_usd` was deliberately removed from `agent_runs` in migration `0009_complex_runaways.sql` (`ALTER TABLE "agent_runs" DROP COLUMN "cost_usd"`). It was re-added in `0010_grey_naoko.sql`. If you see the column missing and old data showing "—", that is expected — only runs after migration 0010 have persisted cost.

- 2026-06-23: `buildSamples` searches for config files (`tsconfig.json`, `.eslintrc.*`, etc.) only at the repo root — it never descends into subdirectories. Monorepos (DevDigest: `server/tsconfig.json`, `client/tsconfig.json`) get **0 config samples**. JavaScript SPAs with root-level configs get 1–2 at best. With an unindexed repo (no repo-intel), the LLM receives a near-empty input and returns `[]`. Fix: glob the config files recursively or add subdirectory paths to the search list. (`src/modules/conventions/extractor.ts:27-96`)

- 2026-06-23: The conventions system prompt contains "Do NOT include generic best practices obvious to any TypeScript developer" — for JavaScript repos, the LLM treats most Prettier/ESLint conventions as "obvious JS knowledge" and discards them, silently producing `[]`. The prompt is implicitly TypeScript-only. (`src/modules/conventions/extractor.ts:100`)

## Codebase Patterns

- 2026-06-22: The `conventions` table, `ConventionCandidate` Zod schema, and `FeatureModelId: 'conventions'` feature model config were all pre-built before the Conventions Extractor feature was implemented. If adding convention-related work, the schema (`src/db/schema/knowledge.ts`), shared contract (`src/vendor/shared/contracts/knowledge.ts`), and feature model entry (`src/modules/settings/feature-models.ts`) already exist — no new migration or contract needed. (`src/db/schema/knowledge.ts`, `src/vendor/shared/contracts/knowledge.ts`)

- 2026-06-22: To resolve a feature model to `{ model, provider }` from workspace settings, use `resolveFeatureModel(container, workspaceId, featureModelId)` — this handles workspace override → registry default. Then pass the provider to `container.llm(provider)` to get the `LLMProvider` adapter. Pattern used in `ConventionsService.extract()`. (`src/modules/conventions/service.ts`)

- 2026-06-22: `service.get()` for skills does NOT automatically include stats — `statsForSkills()` must be called explicitly with the single id, just like `list()` does for the batch. If the skill DTO returned by `GET /skills/:id` shows `agent_count/pull_pct/accept_pct` as `null`, the fix is to add `statsForSkills([row.id])` inside `get()`. Forgetting this is silent — no type error, the fields are just nullish. (`src/modules/skills/service.ts:get`)

- 2026-06-22: Multi-query aggregate pattern in repository: `statsForSkills()` runs 3 separate Drizzle queries (agent count, PR pull count, finding accept count) then merges them into a single `Map<skillId, SkillStats>` via JS. This avoids a complex multi-join SQL query and is efficient when the id list is reasonable (skills per workspace). Follow the same pattern for any new per-skill aggregates: one focused query per metric, merge in JS. (`src/modules/skills/repository.ts:statsForSkills`)

- 2026-06-20: `ReviewRepository` (src/modules/reviews/repository.ts) is a thin wrapper class over the function-level repos in `repository/run.repo.ts`, `review.repo.ts`, `pull.repo.ts`. When adding a new parameter to a repo function (e.g. `completeAgentRun`), the class method signature in `repository.ts` must be updated separately — it does NOT auto-derive from the underlying function's type. (`src/modules/reviews/repository.ts:151`)
- 2026-06-20: Cost calculation (`estimateCost`) lives in `src/adapters/llm/pricing.ts` and is used by the LLM adapters at call time. The `ReviewOutcome` returned by `reviewPullRequest()` already contains a computed `costUsd` — no re-computation needed at persistence time. (`reviewer-core/src/review/run.ts`)
- 2026-06-20: The PR list handler (`src/modules/pulls/routes.ts`) computes derived per-PR aggregates (score, cost) with a separate IN-query + JS Map pattern after the main PR rows query — not via SQL JOIN. When adding a new per-PR aggregate to the list, follow this pattern (see `latestRunCostByPr`). (`src/modules/pulls/routes.ts:119`)

## Tool & Library Notes

- 2026-06-20: `pnpm db:generate` diffs the Drizzle schema files against the migration journal (no live DB needed) and produces a new `.sql` file in `src/db/migrations/`. Never hand-write or edit migration files. Always run `pnpm db:migrate` after generating. (`src/db/migrations/`)

- 2026-06-22: `fflate` exports `zipSync` and `strToU8` alongside `unzipSync`/`strFromU8` — use them in unit tests to create in-process ZIP buffers without touching the filesystem. Pattern: `Buffer.from(zipSync({ 'dir/SKILL.md': strToU8(content) }))`. No extra import needed — they're in the same package already used by the service. (`src/modules/skills/import.service.test.ts`)

## Recurring Errors & Fixes

- 2026-06-22: LLM-supplied file paths (e.g. `evidencePath` from extraction JSON) must be sanitized before any `fs` call — use `path.resolve(fullPath).startsWith(path.resolve(repoPath))` and skip paths that escape the repo root. Same pattern already used in `src/modules/skills/import.service.ts:39`. Without the guard, a prompt-injected model output could cause reads outside the cloned repo directory. (`src/modules/conventions/extractor.ts:verifyEvidence`)

- 2026-06-22: LLMs may return `confidence: 85` (integer) instead of `0.85` (fraction). Clamp immediately after parsing: `Math.max(0, Math.min(1, Number(raw.confidence) || 0))`. Also widen the type check to accept `'string'` for confidence, since some models quote numeric values. Without clamping, the value persists in DB and renders incorrectly (e.g. 9500% confidence bar). (`src/modules/conventions/extractor.ts:callLLM`)

- 2026-06-22: Using `if (!content)` to guard a `Map.get()` result silently drops entries whose value is an empty string (`''`). The correct guard is `if (content === undefined)` — Map.get() returns `undefined` only when the key is absent, not when the value is an empty string. Caught in `assembleSkill` during code review. (`src/modules/skills/import.service.ts:assembleSkill`)

- 2026-06-22: `github.com/.../blob/...` URLs return HTML (the GitHub web UI page), not the raw file. `SkillsImportService.previewFromUrl()` now auto-converts blob URLs to `raw.githubusercontent.com` and rejects responses with `content-type: text/html`. If adding new URL-fetching logic, always validate `content-type` before parsing as text. (`src/modules/skills/import.service.ts:normalizeGitHubUrl`)

## Session Notes

- 2026-06-26: Implemented full Conventions Extractor feature (branch l-02-home-work). Server: `conventions/` module with repository (Drizzle CRUD), extractor (buildSamples + callLLM + verifyEvidence), service (sync pipeline), routes (POST /repos/:id/conventions/extract, GET, PATCH, DELETE), registered in `modules/index.ts`. 14 unit tests for extractor (verifyEvidence + callLLM parsing + path traversal). No new migration — `conventions` table pre-existed. (`src/modules/conventions/`)

- 2026-06-22: Implemented conventions extractor (branch l-02-home-work, Task 2). `buildSamples` reads 9 config files + top-12 ranked files via `repoIntel.getConventionSamples`. `callLLM` uses `LLMProvider.complete()` (plain text, not `completeStructured`) — returns `[]` on parse errors per spec. `verifyEvidence` uses `fs.existsSync` + per-line includes search within ±5 lines of `evidenceLine`. All 3 functions + types exported. TypeScript compiles clean. (`src/modules/conventions/extractor.ts`)

- 2026-06-22: Implemented directory-based ZIP skill import (branch l-02-home-work). `previewFromZip` now treats each directory containing `SKILL.md` as one skill — loose `.md` files and dirs without `SKILL.md` are silently ignored. `parseFrontmatter` extended to parse YAML list values (`Record<string, string | string[]>`); callers use `typeof` + `Array.isArray` guards. `assembleSkill` private method reads `includes:` frontmatter, resolves paths relative to the skill dir, and appends content with `\n\n`. No DB/contract/client changes. (`src/modules/skills/import.service.ts`)

- 2026-06-20: Implemented Run Cost Badge (feature L01). Added `cost_usd double precision` back to `agent_runs` (migration 0010), wired `outcome.costUsd` through `run-executor → completeAgentRun → DB`, added `cost_usd` to `RunSummary` + `RunStats` contracts, and added `last_run_cost_usd` to the PR list response via a last-done-run subquery.

- 2026-06-23: `run-executor.ts` skills loading was silently removed in `15fa391 chore(part0): strip server to starter feature set`. Skills linked to an agent never appeared in logs or Prompt Assembly after that commit. Fix: in `runOneAgent`, call `this.agents.linkedSkills(agent.id)`, filter by `l.enabled && l.skill.enabled` (BOTH the agent-link flag AND the skill's global enabled flag), format each as `### ${skill.name}\n${skill.body}`, wrap in `runLog.step('Loading enabled skills', ...)`, pass result as `skills` to `reviewPullRequest`. Using only `l.skill.enabled` (the global flag) misses per-agent toggles; using only `l.enabled` misses globally disabled skills. (`src/modules/reviews/run-executor.ts:runOneAgent`)

- 2026-06-23: `conventions` `listForRepo` query had `ORDER BY confidence DESC` with no secondary key — Postgres returns equal-confidence rows in non-deterministic order, and after UPDATE the modified row can move to a different position in the result. Fix: add `asc(t.conventions.id)` as tiebreaker so server output is fully deterministic regardless of which rows were recently updated. (`src/modules/conventions/repository.ts:listForRepo`)

- 2026-06-23: Fixed Conventions extractor producing 0 results for monorepos and JS projects. (1) `buildSamples` now scans root + all immediate non-junk subdirs for config files (catches `server/tsconfig.json`, `client/tsconfig.json` etc.). (2) System prompt changed from "obvious to any TypeScript developer" → "obvious to any experienced developer" — JS projects no longer filtered out. (`src/modules/conventions/extractor.ts`)

- 2026-06-23: Fixed Conventions extractor returning `[]` silently for reasoning models. Root cause: `OpenRouterProvider.complete()` returned empty `text` when `message.content` was null — reasoning models (DeepSeek V4 Flash, R1) put the answer in `reasoning_content`/`reasoning`. Fix is in `reviewer-core` (`src/llm/openrouter.ts`). Also: LLM responses that start with preamble text before `[` were silently failing `JSON.parse`; fix is to find the first `[` and last `]` in the full response. (`src/modules/conventions/extractor.ts:callLLM`)

## Open Questions
