# server — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/api`.

## What Works

## What Doesn't Work

- 2026-06-20: `cost_usd` was deliberately removed from `agent_runs` in migration `0009_complex_runaways.sql` (`ALTER TABLE "agent_runs" DROP COLUMN "cost_usd"`). It was re-added in `0010_grey_naoko.sql`. If you see the column missing and old data showing "—", that is expected — only runs after migration 0010 have persisted cost.

## Codebase Patterns

- 2026-06-20: `ReviewRepository` (src/modules/reviews/repository.ts) is a thin wrapper class over the function-level repos in `repository/run.repo.ts`, `review.repo.ts`, `pull.repo.ts`. When adding a new parameter to a repo function (e.g. `completeAgentRun`), the class method signature in `repository.ts` must be updated separately — it does NOT auto-derive from the underlying function's type. (`src/modules/reviews/repository.ts:151`)
- 2026-06-20: Cost calculation (`estimateCost`) lives in `src/adapters/llm/pricing.ts` and is used by the LLM adapters at call time. The `ReviewOutcome` returned by `reviewPullRequest()` already contains a computed `costUsd` — no re-computation needed at persistence time. (`reviewer-core/src/review/run.ts`)
- 2026-06-20: The PR list handler (`src/modules/pulls/routes.ts`) computes derived per-PR aggregates (score, cost) with a separate IN-query + JS Map pattern after the main PR rows query — not via SQL JOIN. When adding a new per-PR aggregate to the list, follow this pattern (see `latestRunCostByPr`). (`src/modules/pulls/routes.ts:119`)

## Tool & Library Notes

- 2026-06-20: `pnpm db:generate` diffs the Drizzle schema files against the migration journal (no live DB needed) and produces a new `.sql` file in `src/db/migrations/`. Never hand-write or edit migration files. Always run `pnpm db:migrate` after generating. (`src/db/migrations/`)

## Recurring Errors & Fixes

- 2026-06-22: `github.com/.../blob/...` URLs return HTML (the GitHub web UI page), not the raw file. `SkillsImportService.previewFromUrl()` now auto-converts blob URLs to `raw.githubusercontent.com` and rejects responses with `content-type: text/html`. If adding new URL-fetching logic, always validate `content-type` before parsing as text. (`src/modules/skills/import.service.ts:normalizeGitHubUrl`)

## Session Notes

- 2026-06-20: Implemented Run Cost Badge (feature L01). Added `cost_usd double precision` back to `agent_runs` (migration 0010), wired `outcome.costUsd` through `run-executor → completeAgentRun → DB`, added `cost_usd` to `RunSummary` + `RunStats` contracts, and added `last_run_cost_usd` to the PR list response via a last-done-run subquery.

## Open Questions
