# server — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/api`.

## What Works

## What Doesn't Work

- 2026-06-22: For LLM extraction tasks that must return `[]` on parse errors (not throw), use `llm.complete()` — NOT `llm.completeStructured()`. `completeStructured()` throws a validation error when the model response doesn't match the schema, which breaks the `[]`-on-error contract. `complete()` returns raw text and lets you catch `JSON.parse` failures yourself. (`src/modules/conventions/extractor.ts:callLLM`)

- 2026-06-20: `cost_usd` was deliberately removed from `agent_runs` in migration `0009_complex_runaways.sql` (`ALTER TABLE "agent_runs" DROP COLUMN "cost_usd"`). It was re-added in `0010_grey_naoko.sql`. If you see the column missing and old data showing "—", that is expected — only runs after migration 0010 have persisted cost.

- 2026-06-23: `buildSamples` searches for config files (`tsconfig.json`, `.eslintrc.*`, etc.) only at the repo root — it never descends into subdirectories. Monorepos (DevDigest: `server/tsconfig.json`, `client/tsconfig.json`) get **0 config samples**. JavaScript SPAs with root-level configs get 1–2 at best. With an unindexed repo (no repo-intel), the LLM receives a near-empty input and returns `[]`. Fix: glob the config files recursively or add subdirectory paths to the search list. (`src/modules/conventions/extractor.ts:27-96`)

- 2026-06-23: The conventions system prompt contains "Do NOT include generic best practices obvious to any TypeScript developer" — for JavaScript repos, the LLM treats most Prettier/ESLint conventions as "obvious JS knowledge" and discards them, silently producing `[]`. The prompt is implicitly TypeScript-only. (`src/modules/conventions/extractor.ts:100`)

- 2026-06-26: `IntentService.generate()` initially called `this.container.db.select().from(t.pullRequests)` directly — raw Drizzle queries from a service class bypass the repository layer (onion invariant: service → repository → db). Architecture reviewer flagged HIGH. Fix: construct `ReviewRepository(container.db)` in the constructor, call `this.repo.getPull()`, `getPrFiles()`, `getRepo()` instead, and remove the `* as t` and bare `drizzle-orm` imports. (`src/modules/intent/service.ts`)

## Codebase Patterns

- 2026-06-26: `pr_intent` table (`src/db/schema/reviews.ts:48-55`), `Intent`/`PrIntentRecord` Zod contracts (`src/vendor/shared/contracts/brief.ts:9-14`), `upsertIntent`/`getIntent` on `ReviewRepository`, and `review_intent` feature model entry in `platform.ts` all pre-existed before the Intent Layer feature. No migration, no new contract, and no new repo method was needed — only generation logic, routes, and UI were missing. Grep before adding any intent infrastructure. (`src/modules/reviews/repository.ts`, `src/vendor/shared/contracts/brief.ts`)

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

- 2026-06-26: Agent `skills:` frontmatter entries are loaded into context at startup (eager) — a 600-line skill costs ~4,500 tokens per invocation regardless of whether the agent uses it. Prefer loading large, infrequently-needed skills lazily via the `Skill` tool. `react-testing-library` (604 lines) was removed from `planner.md`'s eager list: the planner references the skill by name in task definitions, it never writes RTL syntax. (`.claude/agents/planner.md`)

## Recurring Errors & Fixes

- 2026-06-22: LLM-supplied file paths (e.g. `evidencePath` from extraction JSON) must be sanitized before any `fs` call — use `path.resolve(fullPath).startsWith(path.resolve(repoPath))` and skip paths that escape the repo root. Same pattern already used in `src/modules/skills/import.service.ts:39`. Without the guard, a prompt-injected model output could cause reads outside the cloned repo directory. (`src/modules/conventions/extractor.ts:verifyEvidence`)

- 2026-06-22: LLMs may return `confidence: 85` (integer) instead of `0.85` (fraction). Clamp immediately after parsing: `Math.max(0, Math.min(1, Number(raw.confidence) || 0))`. Also widen the type check to accept `'string'` for confidence, since some models quote numeric values. Without clamping, the value persists in DB and renders incorrectly (e.g. 9500% confidence bar). (`src/modules/conventions/extractor.ts:callLLM`)

- 2026-06-22: Using `if (!content)` to guard a `Map.get()` result silently drops entries whose value is an empty string (`''`). The correct guard is `if (content === undefined)` — Map.get() returns `undefined` only when the key is absent, not when the value is an empty string. Caught in `assembleSkill` during code review. (`src/modules/skills/import.service.ts:assembleSkill`)

- 2026-06-22: `github.com/.../blob/...` URLs return HTML (the GitHub web UI page), not the raw file. `SkillsImportService.previewFromUrl()` now auto-converts blob URLs to `raw.githubusercontent.com` and rejects responses with `content-type: text/html`. If adding new URL-fetching logic, always validate `content-type` before parsing as text. (`src/modules/skills/import.service.ts:normalizeGitHubUrl`)

## Session Notes

- 2026-06-24: Fixed `/import/confirm` bypass (resolves Open Questions entry 2026-06-24). Added `max(200)` on `name`, `max(500)` on `description`, and `max(50_000)` on `body` to `SkillPreview` in the shared contract. Because `ImportConfirmBody = z.object({ previews: z.array(SkillPreview) })`, Fastify's Zod validation now enforces these limits at the confirm endpoint for any request origin. (`src/vendor/shared/contracts/knowledge.ts:SkillPreview`)

- 2026-06-26: Implemented full Conventions Extractor feature (branch l-02-home-work). Server: `conventions/` module with repository (Drizzle CRUD), extractor (buildSamples + callLLM + verifyEvidence), service (sync pipeline), routes (POST /repos/:id/conventions/extract, GET, PATCH, DELETE), registered in `modules/index.ts`. 14 unit tests for extractor (verifyEvidence + callLLM parsing + path traversal). No new migration — `conventions` table pre-existed. (`src/modules/conventions/`)

- 2026-06-22: Implemented conventions extractor (branch l-02-home-work, Task 2). `buildSamples` reads 9 config files + top-12 ranked files via `repoIntel.getConventionSamples`. `callLLM` uses `LLMProvider.complete()` (plain text, not `completeStructured`) — returns `[]` on parse errors per spec. `verifyEvidence` uses `fs.existsSync` + per-line includes search within ±5 lines of `evidenceLine`. All 3 functions + types exported. TypeScript compiles clean. (`src/modules/conventions/extractor.ts`)

- 2026-06-22: Implemented directory-based ZIP skill import (branch l-02-home-work). `previewFromZip` now treats each directory containing `SKILL.md` as one skill — loose `.md` files and dirs without `SKILL.md` are silently ignored. `parseFrontmatter` extended to parse YAML list values (`Record<string, string | string[]>`); callers use `typeof` + `Array.isArray` guards. `assembleSkill` private method reads `includes:` frontmatter, resolves paths relative to the skill dir, and appends content with `\n\n`. No DB/contract/client changes. (`src/modules/skills/import.service.ts`)

- 2026-06-20: Implemented Run Cost Badge (feature L01). Added `cost_usd double precision` back to `agent_runs` (migration 0010), wired `outcome.costUsd` through `run-executor → completeAgentRun → DB`, added `cost_usd` to `RunSummary` + `RunStats` contracts, and added `last_run_cost_usd` to the PR list response via a last-done-run subquery.

- 2026-06-23: `run-executor.ts` skills loading was silently removed in `15fa391 chore(part0): strip server to starter feature set`. Skills linked to an agent never appeared in logs or Prompt Assembly after that commit. Fix: in `runOneAgent`, call `this.agents.linkedSkills(agent.id)`, filter by `l.enabled && l.skill.enabled` (BOTH the agent-link flag AND the skill's global enabled flag), format each as `### ${skill.name}\n${skill.body}`, wrap in `runLog.step('Loading enabled skills', ...)`, pass result as `skills` to `reviewPullRequest`. Using only `l.skill.enabled` (the global flag) misses per-agent toggles; using only `l.enabled` misses globally disabled skills. (`src/modules/reviews/run-executor.ts:runOneAgent`)

- 2026-06-23: `conventions` `listForRepo` query had `ORDER BY confidence DESC` with no secondary key — Postgres returns equal-confidence rows in non-deterministic order, and after UPDATE the modified row can move to a different position in the result. Fix: add `asc(t.conventions.id)` as tiebreaker so server output is fully deterministic regardless of which rows were recently updated. (`src/modules/conventions/repository.ts:listForRepo`)

- 2026-06-23: Fixed Conventions extractor producing 0 results for monorepos and JS projects. (1) `buildSamples` now scans root + all immediate non-junk subdirs for config files (catches `server/tsconfig.json`, `client/tsconfig.json` etc.). (2) System prompt changed from "obvious to any TypeScript developer" → "obvious to any experienced developer" — JS projects no longer filtered out. (`src/modules/conventions/extractor.ts`)

- 2026-06-23: Fixed Conventions extractor returning `[]` silently for reasoning models. Root cause: `OpenRouterProvider.complete()` returned empty `text` when `message.content` was null — reasoning models (DeepSeek V4 Flash, R1) put the answer in `reasoning_content`/`reasoning`. Fix is in `reviewer-core` (`src/llm/openrouter.ts`). Also: LLM responses that start with preamble text before `[` were silently failing `JSON.parse`; fix is to find the first `[` and last `]` in the full response. (`src/modules/conventions/extractor.ts:callLLM`)

## Session Notes (continued)

- 2026-06-26: Implemented T-03, T-04, T-05 of the Intent Layer feature. Created `src/modules/intent/service.ts` (IntentService with `get` and `generate` methods), `src/modules/intent/routes.ts` (GET /pulls/:id/intent + POST /pulls/:id/intent/generate), and registered `intentRoutes` in `src/modules/index.ts`. `NotFoundError` is in `../../platform/errors.js` (not `_shared/errors.ts` — that file does not exist). `container.github()` is async and must be awaited. `ReviewRepository.getIntent()` returns `Intent | undefined`, not `null` — callers must check `if (!intent)`. (`src/modules/intent/`)

- 2026-06-26: Implemented T-01 and T-02 of the Intent Layer feature. Created `src/modules/intent/extractor.ts` with `extractHunkHeaders`, `buildIntentInput`, `estimateTokens` (pure helpers) and `callIntentLLM` (LLM call with safe-default contract). All string construction uses array `.join()` to avoid the Edit-tool quote corruption. `Intent` and `LLMProvider` imported from `@devdigest/shared` barrel. Pre-existing curly-quote corruption in `src/vendor/shared/contracts/platform.ts` line 54 (`PR's`) causes TS1127 errors that block `tsc --noEmit` on the whole server package — not related to this task. (`src/modules/intent/extractor.ts`)

- 2026-06-26: `server/src/vendor/shared/contracts/platform.ts` (and its client copy) had a syntax error: `description: 'Derives a PR's intent...'` — the apostrophe in `PR's` terminated the string literal. TypeScript reported TS1005/TS1127 starting at that line. Fix: change the outer delimiter to double-quotes. Use Node.js byte-level replacement rather than PowerShell `WriteAllText` (which truncates the file to 3 bytes on Windows when the file handle is released incorrectly). (`server/src/vendor/shared/contracts/platform.ts:54`)

- 2026-06-26: Optimized `.claude/` agent and skill token usage. Added compact-digest output mode to `researcher` (≤40 lines for agent-to-agent handoffs); added Research Digest bypass to `planner` (skip re-reading files covered by researcher); made `architecture-reviewer` Step 1 skippable via `## Architecture context:`; made `plan-verifier` Pass 2 arch checks skippable via `## Architecture review: PASS`; added Implementer Minimal Path for config-only tasks; trimmed `typescript-expert` (-92 lines, removed migration/monorepo/Biome sections), `react-testing-library` (-58 lines, removed setup section), `drizzle-orm-patterns` (-59 lines, removed inline examples). See `.claude/agents/README.md` § Token-efficient agent chaining.

## Open Questions

- 2026-06-24: **Security gap** — `/skills/import/confirm` accepts `previews: z.array(SkillPreview)` directly from the client body without re-running any sanitization. All import-time guards in `SkillsImportService` (SSRF, path traversal, content-type checks, ZIP size limits) can be bypassed by POSTing arbitrary `body` content straight to this endpoint. The import service validates the *source file*; the confirm endpoint trusts whatever the client sends. Fix: re-validate `body` length and strip/escape dangerous content server-side in `importConfirm()`, independent of what the import service did. (`src/modules/skills/routes.ts:96-100`, `src/modules/skills/service.ts:importConfirm`)
