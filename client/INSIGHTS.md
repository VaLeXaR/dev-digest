# client — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/web`.

## What Works

- 2026-06-20: Per-run finding counts in the timeline are derived from already-loaded `reviews: ReviewRecord[]` (from `usePrReviews`) — no extra API call needed. Build `Map<runId, FindingRecord[]>` in `FindingsTab` and pass it down to `RunHistory`. Same pattern should be used for any per-run aggregation. (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`)
- 2026-06-20: Fixed-position popovers anchored to a table row / timeline item: use `e.currentTarget.closest("[data-run-row]")?.getBoundingClientRect()` so the anchor is the full row bounds even when the user clicks a child button. Clamp `left` to `window.innerWidth - popoverWidth` to prevent off-screen overflow. (`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunFindingsPopover.tsx`)
- 2026-06-20: To truncate a file path from the START (showing filename + line number, not the long prefix), use `direction: "rtl"; textAlign: "left"; overflow: "hidden"; whiteSpace: "nowrap"; textOverflow: "ellipsis"` on the span — the browser places the ellipsis on the left while the visible content is the end of the string. Always pair with `title={fullPath}` for tooltip. (`src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx`)

- 2026-06-20: `SeverityBadge compact` renders a colored background pill (padding + `background: s.bg`) around the icon — looks "boxy" inside popover finding cards. For inline use inside cards, render the icon directly: `const s = SEV[f.severity as Severity]; const SevIc = Icon[s.icon]; <SevIc size={13} style={{ color: s.c }} />`. No background, same color. (`src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx`)
- 2026-06-20: `r.blockers` on `RunSummary` equals the count of CRITICAL findings for a run. Use it to append `· N blockers` after the severity badge row in `RunHistory` via the existing `t("runStatus.blockers", { count })` translation key — the i18n string already includes the leading `·` separator. (`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`)

## What Doesn't Work

## Codebase Patterns

- 2026-06-20: `src/vendor/shared/` is a **manual copy** of `server/src/vendor/shared/` — not a symlink or published package. Any change to contracts (Zod schemas, types) must be applied to **both** copies simultaneously. The client CLAUDE.md calls this out: "changes require sync with server". (`client/src/vendor/shared/contracts/`)
- 2026-06-20: Shared formatting helpers for the PR detail area (formatSeconds, formatTokens, formatCost) live in `src/app/repos/[repoId]/pulls/helpers.ts` for route-wide use. The `RunTraceDrawer/helpers.ts` re-exports from there. Do not add new formatters directly inside `RunTraceDrawer/helpers.ts` if they will be needed outside the drawer. (`src/app/repos/[repoId]/pulls/helpers.ts`)
- 2026-06-20: Relative path depth from `pulls/[number]/_components/<ComponentName>/` back to `pulls/` is **3 levels** (`../../../`), not 4. The `[number]` folder counts as one level. Easy to miscalculate — caused a `Cannot find module` type error during this session. (`src/app/repos/[repoId]/pulls/[number]/_components/`)
- 2026-06-20: PR list column layout is controlled by two constants in `constants.ts`: `GRID` (CSS grid-template-columns string) and `COLUMN_KEYS` (array of i18n key suffixes under `list.columns`). Both must be updated together when adding a column. The i18n strings live in `messages/en/prReview.json`. (`src/app/repos/[repoId]/pulls/constants.ts`)

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-06-20: When adding a required (non-optional) field to `RunSummary`, existing test mocks that use `Partial<RunSummary>` as base will fail with `Type 'undefined' is not assignable to type 'X | null'`. Fix: add the new field with a default value (`null`) to the base mock object in the test. (`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:17`)
- 2026-06-20: `Record<string, number>` indexed access returns `number | undefined` in this project (strict / `noUncheckedIndexedAccess`). Accessing with a variable string key in filter/render expressions causes TS2532. Fix: always write `(record[key] ?? 0)` when indexing a plain `Record<string, number>`. (`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`)
- 2026-06-20: `Icon.AlertCircle` does not exist in `@devdigest/ui`. For CRITICAL severity use `Icon.XCircle` (already present and used in `AddRepoView.tsx`). (`src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`)
- 2026-06-20: **Supersedes the entry above.** The canonical per-severity icons are defined in `src/vendor/ui/primitives/tokens.ts` as `SEV`: CRITICAL → `AlertOctagon`, WARNING → `AlertTriangle`, SUGGESTION → `Lightbulb`. Always derive the icon via `SEV[severity].icon` + `Icon[sev.icon]` — never hardcode `XCircle` or `Info` for severity. Previous session got this wrong; future divergence will show visually. (`src/vendor/ui/primitives/tokens.ts`)

## Session Notes

- 2026-06-20: Implemented Run Cost Badge (feature L01). Added `cost_usd` to `RunSummary` + `RunStats` contracts (both vendor copies), `formatCost()` to `pulls/helpers.ts`, COST column to PR list (constants + PRRow), per-run cost badge in RunHistory timeline, and Cost stat card in TraceBody. All 21 unit tests pass.
- 2026-06-20: Implemented severity finding counters (branch l-01-lab/run-coast). (1) PR list page: new FINDINGS column with per-severity badges (`XCircle`/`AlertTriangle`/`Info`) + `FindingsPopover` (lazy-loads via `usePrReviews`). Server: `GET /repos/:id/pulls` now aggregates finding counts per severity via JOIN `findings → reviews`. (2) PR detail timeline: `RunHistory` shows per-run severity badges derived from already-loaded `reviews` map; `RunFindingsPopover` shows finding cards without re-fetching. (3) PR detail REVIEW RUNS: `SeverityFilterBar` chips filter all accordion findings. All 21 tests pass.

- 2026-06-20: Visual polish pass on severity badges and finding popovers. Changed CRITICAL/SUGGESTION icons to match `tokens.ts` canonical (`AlertOctagon`/`Lightbulb`), reduced badge gap (5→2px), replaced `SeverityBadge compact` with bare icons in `FindingsPopover` and `RunFindingsPopover`, made file paths blue (`var(--accent-text)`) with RTL start-truncation + tooltip, fixed "X FINDINGS" header to stay single-line, added `· N blockers` to `RunHistory` severity badge row.

## Open Questions

- 2026-06-20: Stale entry conflict — line "For CRITICAL severity use `Icon.XCircle`" is now wrong; correct answer is `Icon.AlertOctagon` per `tokens.ts`. Human should delete or strike the old entry on next review pass.
