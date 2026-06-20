# client — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/web`.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-06-20: `src/vendor/shared/` is a **manual copy** of `server/src/vendor/shared/` — not a symlink or published package. Any change to contracts (Zod schemas, types) must be applied to **both** copies simultaneously. The client CLAUDE.md calls this out: "changes require sync with server". (`client/src/vendor/shared/contracts/`)
- 2026-06-20: Shared formatting helpers for the PR detail area (formatSeconds, formatTokens, formatCost) live in `src/app/repos/[repoId]/pulls/helpers.ts` for route-wide use. The `RunTraceDrawer/helpers.ts` re-exports from there. Do not add new formatters directly inside `RunTraceDrawer/helpers.ts` if they will be needed outside the drawer. (`src/app/repos/[repoId]/pulls/helpers.ts`)
- 2026-06-20: Relative path depth from `pulls/[number]/_components/<ComponentName>/` back to `pulls/` is **3 levels** (`../../../`), not 4. The `[number]` folder counts as one level. Easy to miscalculate — caused a `Cannot find module` type error during this session. (`src/app/repos/[repoId]/pulls/[number]/_components/`)
- 2026-06-20: PR list column layout is controlled by two constants in `constants.ts`: `GRID` (CSS grid-template-columns string) and `COLUMN_KEYS` (array of i18n key suffixes under `list.columns`). Both must be updated together when adding a column. The i18n strings live in `messages/en/prReview.json`. (`src/app/repos/[repoId]/pulls/constants.ts`)

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-06-20: When adding a required (non-optional) field to `RunSummary`, existing test mocks that use `Partial<RunSummary>` as base will fail with `Type 'undefined' is not assignable to type 'X | null'`. Fix: add the new field with a default value (`null`) to the base mock object in the test. (`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:17`)

## Session Notes

- 2026-06-20: Implemented Run Cost Badge (feature L01). Added `cost_usd` to `RunSummary` + `RunStats` contracts (both vendor copies), `formatCost()` to `pulls/helpers.ts`, COST column to PR list (constants + PRRow), per-run cost badge in RunHistory timeline, and Cost stat card in TraceBody. All 21 unit tests pass.

## Open Questions
