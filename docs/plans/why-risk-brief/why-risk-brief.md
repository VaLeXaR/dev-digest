# Development Plan: Why+Risk Brief

## Overview
Add a per-PR **Why+Risk Brief** — a `{ what, why, risk_level, risks[], review_focus[] }` artifact
produced by exactly one structured LLM call, assembled only from already-computed derived facts
(intent, blast-radius summary, grouped diff statistics, linked issue, path-overlap-selected
Context-Folder specs) and never from raw diff bodies. It ships as a cached-read + regenerate pair of
routes, a new `pr_why_risk_brief` table, a `why_risk_brief` feature-model id, and a new `PrBriefCard`
on the PR Overview tab placed below the Intent/Blast Radius grid. Source spec:
`specs/SPEC-2026-07-11-why-risk-brief/SPEC-2026-07-11-why-risk-brief.md` (approved 2026-07-11).

## Execution mode
**Multi-agent (parallel implementers, strict Owned-path partitioning) — confirmed in `grilling`
2026-07-11.** This matches the repo's standard SDD pipeline (`implementer ×N`) and the change has
clear domain seams: shared contracts, DB/repository, a self-contained new `why-risk-brief` backend
module, and three client files. The DAG is layered (contracts → backend/repo → UI), but two
parallel opportunities exist (T-01 ∥ T-03 in Phase 1; client hooks T-08 can begin as soon as
Phase 1 contracts land, concurrent with the Phase 2 backend build). Owned paths never overlap at
file or parent-directory level for any two concurrent tasks.

## Requirements
<!-- Restates only what the approved spec (its AC-1..AC-18, success criteria, and Assumptions) states. -->
- R1 (AC-1): Opening the Overview tab renders `PrBriefCard` from the cached brief with **zero** LLM calls.
- R2 (AC-2): When no brief exists yet, `PrBriefCard` shows an empty state with a generate action, not an error.
- R3 (AC-3): The regenerate action calls `POST /pulls/:id/brief/generate`, which performs exactly one structured LLM call and persists the result.
- R4 (AC-4): Generation input is assembled only from intent, blast-radius summary, grouped diff statistics, the linked issue, and selected Context-Folder specs — never raw diff/patch bodies.
- R5 (AC-5): The brief contains exactly the fields `what`, `why`, `risk_level`, `risks[]`, `review_focus[]`.
- R6 (AC-6): Before persisting, drop any risk or review-focus reference that does not resolve to a file path or endpoint present in the assembled input.
- R7 (AC-7): While generation is in progress, `PrBriefCard` shows a non-dismissible loading state on the regenerate action.
- R8 (AC-8): If the structured call fails or returns an unparseable payload, return the last persisted brief when one exists, else a deterministic empty brief carrying the failure reason — never a 5xx.
- R9 (AC-9): Render `risk_level` with both a distinct color and a text label per severity (high/medium/low) — never color alone.
- R10 (AC-10): A review-focus item referencing a file changed in the PR navigates to that file and line in the Files-changed diff view.
- R11 (AC-11): A review-focus or risk reference to a file not in the PR diff links to GitHub instead of the in-app diff view.
- R12 (AC-12): Regenerating overwrites the PR's stored brief in place (upsert keyed by `pr_id`).
- R13 (AC-13): Linked-issue body and Context-Folder spec text in the prompt are treated as data, not instructions, applying the same injection-guard wrapping as `reviewer-core/prompt.ts`'s `INJECTION_GUARD`.
- R14 (AC-14): Include a Context-Folder spec only when its repo-relative path shares a directory prefix with a file changed in the PR, up to the workspace's `context_token_budget` cap; include none when no discovered spec overlaps.
- R15 (AC-15): If Smart Diff grouping has not been generated, assemble diff-statistics from raw per-file additions/deletions instead of blocking generation.
- R16 (AC-16): Render `PrBriefCard` as a single card below the Intent/Blast Radius two-column grid, with `review_focus[]` as that same card's sub-section rather than a separate card.
- R17 (AC-17): Render `PrBriefCard`'s `risks[]` independently of `IntentCard`'s existing "RISK AREAS" section, without modifying `IntentCard`.
- R18 (AC-18): If a risk's `file_refs` are all dropped by AC-6, still render its `title`, `explanation`, and `severity`, visually marked as unlinked, instead of dropping the risk.
- R19 (SC): `GET /pulls/:id/brief` issues 0 LLM calls; `POST .../generate` issues exactly 1 structured call; 100% of rendered references resolve to a real path/endpoint; generation prompt token count stays ≤25% of the full-diff token estimate (measured with the same `estimateTokens` instrument Intent logs, `server/src/modules/intent/service.ts:107-121`).
- R20 (spec Assumptions): New table `pr_why_risk_brief` (`pr_id` PK, FK→`pull_requests` cascade, jsonb), new `why_risk_brief` feature-model id, and `WhyRiskBrief`/`ReviewFocusItem` contracts — all independent of the existing `pr_brief` table, `risk_brief` id, and dead `PrBrief` type; those are left untouched.

## Recommendations
<!-- All three confirmed by the requester in `grilling` 2026-07-11 — now binding. -->
- Use `LLMProvider.complete()` + manual `JSON.parse` + `WhyRiskBrief.safeParse` for the one generation call, **not** `completeStructured()` — `server/INSIGHTS.md` (2026-06-22) records that `completeStructured()` throws on schema mismatch, which would break AC-8's "return an empty brief with a reason, never 5xx" contract. "Structured" in the spec refers to the output shape, which a safe-parse path satisfies while honoring AC-8. This mirrors `RisksService.callRisksLLM` (`server/src/modules/risks/extractor.ts:76-143`). **Confirmed.**
- Set the `why_risk_brief` `FEATURE_MODELS` entry's default to `openai` / `gpt-4.1` (mirroring the existing `risk_brief` entry, `platform.ts:59-65`) with label `"PR Review · Why+Risk Brief"` — the spec confirms the id is independent but does not fix a default provider/model or label. **Confirmed.**
- Render `PrBriefCard`'s `risk_level` and `risks[]` severity styling by reusing `IntentCard`'s established severity chip pattern (`RISK_ICON`/`RISK_STYLE` for high/medium/low, `IntentCard.tsx:17-27`) — the design mockup does not draw the new card's `what`/`why`/`risk_level` header explicitly (see Design audit). **Confirmed**, with the layout specifics resolved below.

## Design references
| File | Shows |
| --- | --- |
| `specs/SPEC-2026-07-11-why-risk-brief/design/01-overview-pr-brief.png` | PR Overview tab: "PR BRIEF" label above the shipped `VerdictBanner`, the Intent + Blast Radius cards, and a bottom "REVIEW FOCUS — READ THESE FIRST" card of `path:line — reason` rows. Grounds `PrBriefCard` placement + the review-focus sub-section (AC-9, AC-10, AC-11, AC-16, User stories 1&3). Inherited from the source spec's `design/` folder — not duplicated. |
| `specs/SPEC-2026-07-11-why-risk-brief/design/02-files-changed-smart-diff.png` | Files-changed tab / Smart Diff — **context only** (already-shipped feature, a candidate input source), not part of this card. |

## Design audit
<!-- Every visible element in design/01 relevant to PrBriefCard, at style level, cites the exact file. -->
| Panel | Element | Design file | Requirement |
| ----- | ------- | ------------ | ----------- |
| Top of Overview | "PR BRIEF" label (file icon) above the `VerdictBanner` | `design/01-overview-pr-brief.png` | Non-goal — the shipped `VerdictBanner` is NOT replaced (spec Non-goals). No task. |
| Intent card | "INTENT" + quoted intent + IN/OUT OF SCOPE columns + "RISK AREAS" chips | `design/01-overview-pr-brief.png` | Existing `IntentCard`, unchanged (AC-17). No task. |
| Blast Radius card | "BLAST RADIUS" tree/graph | `design/01-overview-pr-brief.png` | Existing `BlastRadiusCard`, unchanged. No task. |
| Bottom "REVIEW FOCUS" card | Section label "REVIEW FOCUS — READ THESE FIRST" + count badge ("4") | `design/01-overview-pr-brief.png` | AC-16 — renders as `PrBriefCard`'s sub-section (confirmed placement), not a literal separate card → T-09 |
| Bottom "REVIEW FOCUS" card | Each row: a ▸ chevron glyph, a monospace blue `path:line` link, an em-dash `—`, then plain-text reason (e.g. `src/config.ts:12 — live Stripe key…`) | `design/01-overview-pr-brief.png` | AC-10/AC-11 (link target in-diff vs GitHub), review-focus row style → T-09 |
| PrBriefCard `what`/`why`/`risk_level` header | **Not drawn** in design/01 | `design/01-overview-pr-brief.png` | **GAP, resolved in `grilling` 2026-07-11.** No visual ground truth existed; requester confirmed: `risk_level` renders as a severity chip/badge (IntentCard's `RISK_ICON`/`RISK_STYLE` pattern) positioned to the **left** of the `what`/`why` text, and the card's internal block order is **what/why/risk_level header → risks[] → review_focus[]** (review_focus stays innermost/last, matching the mockup's bottom position). |
| PrBriefCard `risks[]` list | **Not drawn** as a distinct list in design/01 (IntentCard's RISK AREAS chips are a different, independent list per AC-17) | `design/01-overview-pr-brief.png` | **GAP, resolved in `grilling` 2026-07-11.** Requester confirmed: render as chips identical in style to `IntentCard`'s RISK AREAS (icon + title, chevron-expandable) for visual consistency. A risk with all `file_refs` dropped (AC-18) renders **without** the chevron/file-link, with a small text label ("не пов'язано з файлом" / "not linked to a file") in place of the file reference — one glance distinguishes it from normal chips without extra visual weight. **Superseded 2026-07-11 (post-verification fix, R11 literal):** each non-empty `file_refs[]` entry is now individually clickable — in-diff files call `onGoToDiff(file)` (in-app nav, no line since `Risk.file_refs` carries no line number), out-of-diff files open a `githubBlobUrl(...)` link in a new tab (also no line anchor) — matching `review_focus[]`'s AC-10/AC-11 link treatment instead of rendering as plain joined `file:line` text. See `PrBriefCard.tsx`'s risk-row `file_refs.map` and `PrBriefCard.test.tsx`'s R11/AC-11 cases. |

Orphan-contract check: the new `WhyRiskBrief`/`ReviewFocusItem`/`PrWhyRiskBriefRecord` Zod schemas
(T-01) each have implementation + render tasks (T-06/T-07 backend, T-09 client). No pre-existing
`@devdigest/shared` schema is left touched-but-unimplemented by this plan. The dead `PrBrief` type
(`brief.ts:124-130`) is explicitly left untouched (spec Dependencies).

## Affected modules & contracts
- `@devdigest/shared` (both vendor copies) — new `WhyRiskBrief`, `ReviewFocusItem` (in `brief.ts`), `PrWhyRiskBriefRecord` (in `review-api.ts`); new `why_risk_brief` enum value + `FEATURE_MODELS` entry (in `platform.ts`).
- `server` DB — new `pr_why_risk_brief` table (`db/schema/reviews.ts`) + generated migration.
- `server` `reviews` repository — new `upsertWhyRiskBrief`/`getWhyRiskBrief`.
- `server` new module `why-risk-brief/` — assembler, extractor, service, routes; registered in `modules/index.ts`.
- `server` `settings` — new exported `resolveContextSettings` helper (root folders + token budget) so the brief service reads settings via the settings module, not raw `container.db`.
- `client` — new `useBrief`/`useGenerateBrief` hooks (`lib/hooks/brief.ts`), new `PrBriefCard` component, `OverviewTab` wiring, `messages/en/brief.json` additive keys, `lib/feature-models.ts` registry mirror.
- Contracts to add: `WhyRiskBrief`, `ReviewFocusItem`, `PrWhyRiskBriefRecord`, `why_risk_brief` id — all in `@devdigest/shared`, synced to both vendor copies in the same task.

## Architecture notes
- **Onion layering (server).** `WhyRiskBriefService` must not run raw `container.db` queries — `server/INSIGHTS.md` (2026-06-26) records that raw Drizzle in `IntentService` was flagged HIGH; it was fixed to route through `ReviewRepository`. The brief service reads PR/files/intent/blast via `ReviewRepository`; discovered docs via the exported `getDiscovery`/`scanRepoDocs` functions (`project-context/discovery.ts:38-72,131-144`); spec-file content via the existing guarded reader `readGuardedFile` (used by `ProjectContextService.getContent`, `project-context/service.ts:73`); and settings (`context_root_folders`, `context_token_budget`) via the new `resolveContextSettings` helper (T-07). Routes never import adapters or `db/schema` directly.
- **Generation calls `container.llm(provider)` directly, NOT reviewer-core.** Follows `IntentService`/`RisksService`/`BlastService`. Because it does not go through `reviewer-core`'s `assemblePrompt`, the injection guard is **not** applied automatically and must be added explicitly (AC-13). `INJECTION_GUARD` and `wrapUntrusted` are **exported from `@devdigest/reviewer-core`** (`reviewer-core/src/index.ts:16-21`) and reviewer-core is already a server dependency (`platform/container.ts:22`) — import and reuse them rather than re-implementing; this is reuse of the shared defense, not routing the LLM call through reviewer-core.
- **Feature-model id lives in the shared contract, not `feature-models.ts`.** `server/INSIGHTS.md` (2026-07-02) records that adding a `FeatureModelId` means editing `platform.ts`'s enum + `FEATURE_MODELS` array (both vendor copies); `settings/feature-models.ts` is generically derived and needs no change. `resolveFeatureModel(container, workspaceId, 'why_risk_brief')` then resolves provider+model.
- **Repository is a thin wrapper.** `server/INSIGHTS.md` (2026-06-20): adding a repo function requires editing BOTH `repository/pull.repo.ts` (the query) AND `repository.ts` (the class method) — they do not auto-derive.
- **`*Record` shape.** Follows `PrIntentRecord`/`PrRisksRecord`/`PrBlastRecord` (`review-api.ts:59-73`): `WhyRiskBrief.extend({ pr_id: z.string() })`. Both routes return the record; persistence stores the bare `WhyRiskBrief` as jsonb.
- **RSC vs client boundary.** `PrBriefCard`, hooks, and `OverviewTab` are all `"use client"` (data via TanStack Query), matching `BlastRadiusCard`/`IntentCard`.
- **i18n.** `client/src/i18n/request.ts:17-24` auto-loads every `messages/en/*.json` by filename as namespace — no central registration to edit. `PrBriefCard` adds keys under a new `card` object in the existing `messages/en/brief.json` (namespace `brief`); only `en` locale exists.

## INSIGHTS summary
- [server]: Adding a `FeatureModelId` means editing `platform.ts` enum + `FEATURE_MODELS` (both vendor copies), NOT `settings/feature-models.ts` (2026-07-02).
- [server]: Services construct their own `new ReviewRepository(container.db)`; there is no DI seam for the repo. Hermetic tests use `vi.spyOn(ReviewRepository.prototype, 'getPull'|'getPrFiles'|…)` and a dummy `db: {} as never` (2026-07-02).
- [server]: LLM extraction that must return a safe default on parse error uses `llm.complete()` + manual parse, NOT `completeStructured()` (which throws on mismatch) (2026-06-22) — load-bearing for AC-8.
- [server]: `ReviewRepository` is a thin wrapper — new repo functions need edits in both `pull.repo.ts` and `repository.ts` (2026-06-20).
- [server]: Do not run raw `container.db` queries from a service (onion violation flagged HIGH) — go through the repository / module-level helpers (2026-06-26).
- [server]: vitest run-filter is a substring match on the full path — name `.it.test.ts` files and acceptance filters to match the actual landed path (e.g. `src/modules/why-risk-brief/why-risk-brief.it.test.ts`), not a module-name shorthand (2026-07-02).
- [client]: Never `pnpm test -- <filter>` in `client/` — pnpm forwards a literal `"--"` and it silently runs the whole suite (or hangs). Use `pnpm exec vitest run <path>` (CLAUDE.md gotcha; client INSIGHTS 2026-07-09).
- [client]: `useQuery` "disable by nulling key args" drops cached data — gate fetching via the `enabled` param and keep identifying args stable (2026-07-05). Applies to `useBrief` empty-state handling.
- [client]: In-diff vs GitHub link decision uses `changedFileSet.has(file)` → `onGoToDiff(file,line)` else `githubBlobUrl(repoFullName, headSha, file, line)` — exact pattern in `BlastRadiusCard.tsx:167-218` (AC-10/AC-11).

## Phased tasks

> Multi-agent mode: tasks in the same phase with non-overlapping Owned paths may run concurrently.
> Each phase reaches a self-consistent, mergeable state (additive contracts compile unused; backend
> routes work with no UI caller; UI renders last).

### Phase 1 — Contracts, schema, repository

#### T-01: Add `WhyRiskBrief` / `ReviewFocusItem` / `PrWhyRiskBriefRecord` contracts (both vendor copies)

- **Action:** In `server/src/vendor/shared/contracts/brief.ts` add: `ReviewFocusItem = z.object({ file: z.string(), line: z.number().int().optional(), reason: z.string() })` and `WhyRiskBrief = z.object({ what: z.string(), why: z.string(), risk_level: RiskSeverity, risks: z.array(Risk), review_focus: z.array(ReviewFocusItem) })` — reusing the existing `RiskSeverity` (`brief.ts:47`) and `Risk` (`brief.ts:50-57`). In `server/src/vendor/shared/contracts/review-api.ts` add `PrWhyRiskBriefRecord = WhyRiskBrief.extend({ pr_id: z.string() })` with an inferred type export (mirroring `PrRisksRecord`, `review-api.ts:64-65`). Make the identical edits in the client mirror copies `client/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/review-api.ts`. Do NOT touch the dead `PrBrief` type (`brief.ts:124-130`). The barrels (`.../index.ts`) already `export *` from both files (`server/src/vendor/shared/index.ts:18-19`) — no barrel edit needed.
- **Why:** Satisfies R5/R20 and unblocks every downstream task; without the shared contract, backend persist/return and client render have no type.
- **Module:** server + client (shared contract)
- **Type:** core
- **Skills to use:** zod, typescript-expert
- **Owned paths:** `server/src/vendor/shared/contracts/brief.ts`, `server/src/vendor/shared/contracts/review-api.ts`, `client/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/review-api.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Both vendor copies must move in this same task (shared-contract sync). The client copy is a manual mirror — content must be byte-identical to the server copy for the shapes added.
- **Acceptance:** `cd server && pnpm typecheck` and `cd client && pnpm typecheck` both pass; `WhyRiskBrief.parse({ what:'x', why:'y', risk_level:'high', risks:[], review_focus:[{file:'a.ts', reason:'r'}] })` succeeds and `WhyRiskBrief.safeParse({ what:'x' }).success === false`.

#### T-02: Register the `why_risk_brief` feature-model id (both vendor copies + client registry)

- **Action:** In `server/src/vendor/shared/contracts/platform.ts` add `'why_risk_brief'` to the `FeatureModelId` enum (`platform.ts:14-21`) and append a `FEATURE_MODELS` entry (`platform.ts:44-87`) `{ id:'why_risk_brief', label:'PR Review · Why+Risk Brief', description:'Composes a PR why+risk brief from derived facts.', defaultProvider:'openai', defaultModel:'gpt-4.1' }` (default provider/model per Recommendation — confirm in grilling). Make the identical enum+array edit in `client/src/vendor/shared/contracts/platform.ts`. Add the matching runtime entry to the client registry `client/src/lib/feature-models.ts` `FEATURE_MODELS` array (so Settings lists it). Do NOT edit `server/src/modules/settings/feature-models.ts` (it is generically derived — see INSIGHTS 2026-07-02).
- **Why:** Satisfies R3/R20 — `resolveFeatureModel(container, workspaceId, 'why_risk_brief')` in T-07 needs this id to resolve a provider+model; without it the generate route cannot pick a model.
- **Module:** server + client (shared contract)
- **Type:** core
- **Skills to use:** zod, typescript-expert
- **Owned paths:** `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts`, `client/src/lib/feature-models.ts`
- **Depends-on:** T-01 (sequenced to avoid concurrent writes into the shared `contracts/` directory; no code dependency)
- **Risk:** low
- **Known gotchas:** Editing `feature-models.ts` is a common mistake — the id lives ONLY in `platform.ts` (both copies) + the client runtime mirror. `platform.ts` has had curly-quote corruption before (`server/INSIGHTS.md` 2026-06-26) — use straight ASCII quotes and avoid apostrophes inside single-quoted strings.
- **Acceptance:** `cd server && pnpm typecheck` and `cd client && pnpm typecheck` pass; `FeatureModelId.parse('why_risk_brief')` succeeds; the server `FEATURE_MODELS` and client `FEATURE_MODELS` arrays each contain exactly one `why_risk_brief` entry.

#### T-03: Add `pr_why_risk_brief` table + generate migration

- **Action:** In `server/src/db/schema/reviews.ts` add, following the `prBrief` precedent (`reviews.ts:57-62`): `export const prWhyRiskBrief = pgTable('pr_why_risk_brief', { prId: uuid('pr_id').primaryKey().references(() => pullRequests.id, { onDelete: 'cascade' }), json: jsonb('json').notNull() })`. Then run `cd server && pnpm db:generate` to emit a new migration `.sql` under `server/src/db/migrations/` (+ journal update) — never hand-write it — and `pnpm db:migrate` to apply. Confirm the schema barrel `server/src/db/schema.ts` re-exports the new table (it re-exports `schema/reviews.ts`; verify with `Read`).
- **Why:** Satisfies R20 — the cached brief needs a per-PR persistence row; independent of `pr_brief` (left untouched).
- **Module:** server
- **Type:** backend
- **Skills to use:** drizzle-orm-patterns, postgresql-table-design
- **Owned paths:** `server/src/db/schema/reviews.ts`, `server/src/db/migrations/` (new generated files only)
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Migrations do NOT run on boot — `pnpm db:migrate` is mandatory after generate (CLAUDE.md). NEVER edit an existing migration file — generate a new one. NEVER `docker compose down -v`.
- **Acceptance:** `cd server && pnpm db:generate` produces exactly one new migration adding `pr_why_risk_brief`; `pnpm db:migrate` applies it with no error; `pnpm typecheck` passes with `t.prWhyRiskBrief` resolvable.

#### T-04: Add `upsertWhyRiskBrief` / `getWhyRiskBrief` to the review repository

- **Action:** In `server/src/modules/reviews/repository/pull.repo.ts` add two functions mirroring `upsertRisks`/`getRisks` (`pull.repo.ts:73-89`): `upsertWhyRiskBrief(db, prId, brief: WhyRiskBrief)` doing `insert(t.prWhyRiskBrief).values({ prId, json: brief }).onConflictDoUpdate({ target: t.prWhyRiskBrief.prId, set: { json: brief } })`, and `getWhyRiskBrief(db, prId): Promise<WhyRiskBrief | undefined>` selecting the row and returning `WhyRiskBrief.safeParse(row.json)` data or `undefined`. In `server/src/modules/reviews/repository.ts` add the wrapper methods `upsertWhyRiskBrief(prId, brief)` and `getWhyRiskBrief(prId)` delegating to the pull-repo functions (mirroring `upsertRisks`/`getRisks`, `repository.ts:140-146`). Import `WhyRiskBrief` from `@devdigest/shared`.
- **Why:** Satisfies R12/AC-12 (upsert by pr_id) — the service persists and reads the brief through this layer, not raw DB.
- **Module:** server
- **Type:** backend
- **Skills to use:** drizzle-orm-patterns, onion-architecture-node, typescript-expert
- **Owned paths:** `server/src/modules/reviews/repository/pull.repo.ts`, `server/src/modules/reviews/repository.ts`
- **Depends-on:** T-01 (contract), T-03 (`t.prWhyRiskBrief` table)
- **Risk:** low
- **Known gotchas:** The wrapper class method in `repository.ts` does NOT auto-derive from the pull-repo function — add it explicitly (INSIGHTS 2026-06-20). `getWhyRiskBrief` must `safeParse` (like `getRisks`) so a row persisted before a future contract change still degrades to `undefined` instead of throwing.
- **Acceptance:** `cd server && pnpm typecheck` passes; a unit or it-test round-trips `upsertWhyRiskBrief` then `getWhyRiskBrief` returning the same brief, and `getWhyRiskBrief` on an absent pr returns `undefined`.

### Phase 2 — Backend generation pipeline + routes

#### T-05: Deterministic input assembler (derived facts, injection guard, spec selection, diff-stat fallback, token instrument)

- **Action:** Create `server/src/modules/why-risk-brief/assembler.ts` with pure functions (no `container`, no I/O — mirrors `intent/extractor.ts`'s `buildIntentInput`), building multi-line strings via array `.join('\n')` to avoid Edit-tool quote corruption:
  - `buildWhyRiskBriefInput(args)` → string, composing sections from ALREADY-FETCHED derived facts only: intent (`{ intent, in_scope, out_of_scope }`), blast summary + grouped downstream (symbol/caller/endpoint names only), normalized diff statistics, linked issue `{ title, body }`, and selected spec `{ path, content }[]`. It MUST NOT include any raw diff/patch body (AC-4). Wrap every externally-authored block — linked-issue body, spec contents, PR title/body — with `wrapUntrusted(label, text)` and prepend `INJECTION_GUARD`, both imported from `@devdigest/reviewer-core` (AC-13). Cap the linked-issue body at 8000 chars (matching intent, `service.ts:159`).
  - `selectOverlappingSpecs(docs, changedFiles, tokenBudget)` → selected docs: include a discovered doc only when its repo-relative path shares a directory prefix with a changed file, accumulating `token_estimate` until `tokenBudget` would be exceeded; return `[]` when none overlap (AC-14).
  - `normalizeDiffStats({ smartDiffGroups?, rawFiles })` → per-file `{ path, additions, deletions, role? }[]`: prefer `SmartDiffGroup[]` when present, else fall back to raw per-file `additions`/`deletions` (AC-15).
  - `estimateBriefTokens(input)` and a full-diff estimate helper reusing the same approach as `intent/extractor.ts`'s `estimateTokens` (import or re-derive) so the service can log the ≤25% savings instrument (R19/SC4).
- **Why:** Satisfies R4/R13/R14/R15 and SC4 — isolates all deterministic, LLM-free assembly so it is unit-testable without a model, keeping the LLM boundary in T-06.
- **Module:** server
- **Type:** backend
- **Skills to use:** typescript-expert, security, zod
- **Owned paths:** `server/src/modules/why-risk-brief/assembler.ts`, `server/src/modules/why-risk-brief/assembler.test.ts`
- **Depends-on:** T-01 (uses `WhyRiskBrief`/`Risk`/`SmartDiffGroup` types)
- **Risk:** medium
- **Known gotchas:** Path-overlap must be a real directory-prefix test on normalized POSIX paths — `server/INSIGHTS.md` (2026-07-09) records that a naive `startsWith(prefix)` on un-resolved paths is bypassable; compare directory segments, not raw string prefixes. Never pass diff/patch bodies into the input (AC-4). Build strings via array `.join()` (quote-corruption guard).
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/why-risk-brief/assembler.test.ts` passes, covering: (a) no `@@`/patch-body text ever appears in the built input; (b) linked-issue + spec text are wrapped in `<untrusted>` and `INJECTION_GUARD` is present (AC-13); (c) `selectOverlappingSpecs` returns `[]` when no path overlaps and respects the token budget (AC-14); (d) `normalizeDiffStats` falls back to raw additions/deletions when no SmartDiff groups (AC-15).

#### T-06: Structured LLM extractor (one call, reference resolution, unlinked-risk retention, safe-default)

- **Action:** Create `server/src/modules/why-risk-brief/extractor.ts` with `callWhyRiskBriefLLM(input, llm, model, resolvableRefs)` (mirroring `risks/extractor.ts:76-143`): issue exactly ONE call via `llm.complete({ model, messages:[system,user], temperature:0.2, maxTokens })`, extract the JSON object (first `{` … last `}`), `JSON.parse`, then `WhyRiskBrief.safeParse`. Resolution/validation:
  - AC-6: drop any `review_focus[]` item and any `risks[].file_refs[]` entry whose file/endpoint is not in `resolvableRefs` (the set of file paths + endpoints present in the assembled input, passed in by the service).
  - AC-18: if dropping leaves a risk with zero `file_refs`, KEEP the risk (its `title`/`explanation`/`severity`) and mark it (e.g. `file_refs: []`) rather than dropping it.
  - AC-8: on empty text, missing brackets, `JSON.parse` failure, or `safeParse` failure, return a deterministic empty brief `{ what:'', why:'', risk_level:'low', risks:[], review_focus:[] }` plus a `reason` string — never throw. Return shape should let the service distinguish "generated" from "fell back with reason".
  Use `complete()` + manual parse, NOT `completeStructured()` (Recommendation / INSIGHTS 2026-06-22). System prompt built as a string array; specify the exact 5-field output shape (AC-5).
- **Why:** Satisfies R3/R5/R6/R8/R18 and SC2/SC3 — the single structured call plus the resolution gate that guarantees 100% of rendered references resolve.
- **Module:** server
- **Type:** backend
- **Skills to use:** typescript-expert, zod, security
- **Owned paths:** `server/src/modules/why-risk-brief/extractor.ts`, `server/src/modules/why-risk-brief/extractor.test.ts`
- **Depends-on:** T-05 (input type), T-01 (contract)
- **Risk:** medium
- **Known gotchas:** `completeStructured()` throws on schema mismatch and would break AC-8 — use `complete()` + `safeParse` (INSIGHTS 2026-06-22). Reasoning models sometimes return empty content — guard for empty text first. Exactly one `llm.complete` call (SC2) — assert call count in the test.
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/why-risk-brief/extractor.test.ts` passes with a stub `LLMProvider`, covering: (a) exactly one `complete` call; (b) an unresolvable review-focus/file_ref is dropped (AC-6) while a risk whose refs are all dropped is retained with empty `file_refs` (AC-18); (c) unparseable/empty payload returns the deterministic empty brief with a `reason`, no throw (AC-8); (d) a valid payload parses to exactly the 5 fields (AC-5).

#### T-07: `WhyRiskBriefService` + routes + registration + settings accessor

- **Action:** Create `server/src/modules/why-risk-brief/service.ts` — `WhyRiskBriefService(container)` constructing `new ReviewRepository(container.db)` (pattern: `RisksService`). Methods:
  - `get(prId, workspaceId)`: verify PR via `repo.getPull` (throw `NotFoundError` if absent), return `repo.getWhyRiskBrief(prId)` as `{ ...brief, pr_id }` or `null`. **Zero LLM calls** (AC-1/SC1).
  - `generate(prId, workspaceId)`: fetch PR + files (`repo.getPull`/`getPrFiles`), read stored intent (`repo.getIntent`), compute blast summary + grouped downstream (reuse `BlastService`'s derived read or its `groupBlast` output via the repo/`container.repoIntel` — read-only, no LLM), obtain diff-stats (SmartDiff via `SmartDiffService.get` when available, else raw files → `normalizeDiffStats`), best-effort linked issue (mirror `IntentService.generate`'s GitHub try/catch, `service.ts:40-75`), and Context-Folder specs (resolve `context_root_folders`+`context_token_budget` via the new `resolveContextSettings`; `getDiscovery(...)`; `selectOverlappingSpecs`; read each selected doc's content via the guarded reader `readGuardedFile`). Build the input (`buildWhyRiskBriefInput`) + `resolvableRefs` set, log the token-savings instrument (R19/SC4, format like `intent/service.ts:107-121`), resolve model via `resolveFeatureModel(container, workspaceId, 'why_risk_brief')` → `container.llm(provider)`, call `callWhyRiskBriefLLM` (exactly one call), then on success `repo.upsertWhyRiskBrief(prId, brief)` and return `{ ...brief, pr_id }`; on fallback return the last persisted brief if one exists, else the deterministic empty brief with reason (AC-8/AC-12).
  - Create `server/src/modules/why-risk-brief/routes.ts`: `FastifyPluginAsync` + `withTypeProvider<ZodTypeProvider>()`, `new WhyRiskBriefService(app.container)`, `getContext(app.container, req)` for `workspaceId`, `IdParams` from `../_shared/schemas.js`. `GET /pulls/:id/brief` → 404 when `get` returns null (mirror `risks/routes.ts:13-22`); `POST /pulls/:id/brief/generate` → `service.generate(...)` (mirror `risks/routes.ts:26-33`). Register `whyRiskBriefRoutes` in `server/src/modules/index.ts` (one import + one entry).
  - Create `server/src/modules/settings/context-settings.ts`: exported `resolveContextSettings(container, workspaceId): Promise<{ rootFolders: string[]; tokenBudget: number }>` reading the settings rows and applying `rowsToSettings` (mirroring the private `resolveSettings` in `project-context/service.ts:38` and `getFeatureModelOverride`'s read, `settings/feature-models.ts:41-47`) — so the brief service does not query `container.db` directly.
- **Why:** Satisfies R1/R3/R8/R12/R14/R15/R19 (SC1/SC2/SC4) — wires the two routes, the one structured call, and cached-read behavior.
- **Module:** server
- **Type:** backend
- **Skills to use:** fastify-best-practices, onion-architecture-node, drizzle-orm-patterns, typescript-expert, security
- **Owned paths:** `server/src/modules/why-risk-brief/service.ts`, `server/src/modules/why-risk-brief/routes.ts`, `server/src/modules/why-risk-brief/why-risk-brief.it.test.ts`, `server/src/modules/index.ts`, `server/src/modules/settings/context-settings.ts`
- **Depends-on:** T-02 (feature-model id), T-04 (repository), T-05 (assembler), T-06 (extractor)
- **Risk:** high
- **Known gotchas:** Do NOT query `container.db` from the service — read via `ReviewRepository` + `getDiscovery`/`readGuardedFile` + `resolveContextSettings` (onion; INSIGHTS 2026-06-26). `container.github()` is async and best-effort — wrap in try/catch, never let a missing token/linked-issue block generation (edge cases: no intent/blast/specs, degraded repo-intel, no linked issue — proceed with partial input). GET must issue zero LLM calls. Hermetic route/service tests: `vi.spyOn(ReviewRepository.prototype, …)` + injected `overrides.llm` (INSIGHTS 2026-07-02); mock `resolveFeatureModel` via a bare `vi.fn()` reset in `beforeEach` (INSIGHTS 2026-07-02). Name the it-test path to match the vitest substring filter used in Acceptance (INSIGHTS 2026-07-02).
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/why-risk-brief/why-risk-brief.it.test.ts` passes (requires Docker), asserting: (a) `GET /pulls/:id/brief` returns 404 before generation and issues 0 LLM calls (SC1); (b) `POST /pulls/:id/brief/generate` issues exactly one injected-LLM call, persists, and a subsequent GET returns the same brief (AC-1/AC-3/AC-12/SC2); (c) a second generate upserts in place (one row); (d) an LLM stub that throws yields a non-5xx response carrying the prior/empty brief (AC-8). `pnpm typecheck` passes.

### Phase 3 — Client

#### T-08: `useBrief` / `useGenerateBrief` hooks

- **Action:** In `client/src/lib/hooks/brief.ts` add `useBrief(prId)` — `useQuery({ queryKey:['why-risk-brief', prId ?? ''], queryFn: () => api.get<PrWhyRiskBriefRecord>(\`/pulls/\${prId!}/brief\`), enabled: !!prId, retry: false })` (mirror `useRisks`, `brief.ts:40-47`; `retry:false` so a 404 shows the empty state immediately) — and `useGenerateBrief()` — `useMutation({ mutationFn: (prId) => api.post<PrWhyRiskBriefRecord>(\`/pulls/\${prId}/brief/generate\`), onSuccess: (data, prId) => { qc.setQueryData(['why-risk-brief', prId], data); qc.invalidateQueries({ queryKey:['why-risk-brief', prId] }); }, onError: () => notify.error('Failed to generate brief') })` (mirror `useGenerateBlastSummary`, `brief.ts:59-70`). Import `PrWhyRiskBriefRecord` from `@devdigest/shared`.
- **Why:** Satisfies R1/R3 client side — the read hook (zero-LLM cached) and the regenerate mutation.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-best-practices, next-best-practices, typescript-expert
- **Owned paths:** `client/src/lib/hooks/brief.ts`
- **Depends-on:** T-01 (types)
- **Risk:** low
- **Known gotchas:** Keep the query key's identifying args stable across enable/disable — gate via `enabled`, never null the args (client INSIGHTS 2026-07-05). The barrel `client/src/lib/hooks/index.ts` already `export *`s `./brief` — no barrel edit.
- **Acceptance:** `cd client && pnpm typecheck` passes; the hooks are exported from `@/lib/hooks`. (Behavioral coverage lands in T-09's component test.)

#### T-09: `PrBriefCard` component (+ i18n + styles + test)

- **Action:** Create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefCard/` with `PrBriefCard.tsx`, `styles.ts`, `index.ts`, `PrBriefCard.test.tsx` (colocated pattern, like `BlastRadiusCard/`). Props (owned by `OverviewTab`, mirroring `BlastRadiusCard`): `briefData: PrWhyRiskBriefRecord | undefined`, `briefLoading: boolean`, `regenerateButton: React.ReactNode` (loading state owned by parent), `onGoToDiff: (file, line) => void`, `changedFiles: string[]`, `repoFullName?: string | null`, `headSha?: string | null`. Render, top to bottom (block order confirmed in `grilling` 2026-07-11):
  1. **Header:** `risk_level` as a severity chip/badge positioned to the LEFT of the `what`/`why` text (reusing `IntentCard`'s `RISK_ICON`/`RISK_STYLE` pattern, `IntentCard.tsx:17-27`), so it always shows BOTH a distinct color AND a text label per severity (high/medium/low) — never color alone (AC-9). `what`/`why` render as plain text alongside/below the chip.
  2. **`risks[]`:** its OWN list, independent of `IntentCard`'s RISK AREAS (AC-17), styled as chips identical to `IntentCard`'s RISK AREAS chips (icon + title + `file:line`, chevron-expandable to `explanation`). A risk whose `file_refs` are empty (dropped by AC-6) renders WITHOUT the chevron/file-link, showing a text label ("not linked to a file") in place of `file:line`, keeping `title`/`explanation`/`severity` visible (AC-18).
  3. **`review_focus[]`:** a sub-section WITHIN this card (label "REVIEW FOCUS — READ THESE FIRST" + count, per `design/01`), NOT a separate card (AC-16), positioned last/innermost matching the mockup's bottom position. Each row: `file:line` link + `— reason`. Link target: `changedFiles.includes(file)` → button calling `onGoToDiff(file, line)` (AC-10); else an `<a>` to `githubBlobUrl(repoFullName, headSha, file, line)` in a new tab (AC-11) — exact pattern in `BlastRadiusCard.tsx:167-218`; render a plain non-interactive row when `repoFullName`/`headSha` are missing.
  Empty state when `!briefData` (no brief yet): a message + the generate action, not an error (AC-2) — the generate action is the same `regenerateButton` prop the parent always renders (mirrors `BlastRadiusCard`'s `explainButton`/`recalcButton` pattern, which doubles as first-generate and regenerate).
  Add i18n keys under a new `card` object in `client/messages/en/brief.json` (namespace `brief`, `useTranslations('brief')`).
- **Why:** Satisfies R2/R7/R9/R10/R11/R16/R17/R18 — the card itself.
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-11-why-risk-brief/design/01-overview-pr-brief.png` — grounds the "REVIEW FOCUS — READ THESE FIRST" sub-section + `path:line — reason` rows. The `what`/`why`/`risk_level` header and `risks[]` list have no visual ground truth in the mockup; their layout (order, chip style, unlinked-marker) was resolved in `grilling` 2026-07-11 — see Design audit and the Action steps above, now binding.
- **Skills to use:** react-frontend-architecture, react-best-practices, react-testing-library, next-best-practices, typescript-expert
- **Owned paths:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefCard/` (all files), `client/messages/en/brief.json`
- **Depends-on:** T-08 (types via hooks are not imported here, but the record type is; component consumes props), T-01 (types)
- **Risk:** medium
- **Known gotchas:** `PrBriefCard` must NOT import or modify `IntentCard` (AC-17), though it reuses `IntentCard`'s severity chip *style* (copy the pattern, don't import from `IntentCard`'s module to avoid a cross-card coupling). The in-diff vs GitHub decision is `changedFileSet.has(file)` (build a `Set` with `useMemo`) — copy `BlastRadiusCard.tsx:167-218` exactly. Loading state on the regenerate action is owned by `OverviewTab` (passed as `regenerateButton`), matching `explainButton`/`recalcButton`; the card must present it as non-dismissible (AC-7). Only `en` locale exists; `brief.json` already has keys — ADD a `card` object, do not overwrite existing keys.
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefCard"` and `cd client && pnpm typecheck` pass, covering: empty state renders a generate action not an error (AC-2); `risk_level` chip renders a text label alongside color, positioned left of `what`/`why` (AC-9); block order is header → risks[] → review_focus[]; an in-diff review-focus item calls `onGoToDiff` while an out-of-diff one renders a GitHub `<a>` (AC-10/AC-11); a risk with empty `file_refs` renders without a chevron/file-link and shows the "not linked to a file" label, title/severity still visible (AC-18); `risks[]` chip markup matches `IntentCard`'s RISK AREAS chip style. **Design fidelity:** a self-taken screenshot of the rendered review-focus sub-section visually matches `design/01-overview-pr-brief.png`'s "REVIEW FOCUS" rows element-by-element (chevron glyph, monospace `path:line` link, em-dash, reason); the header/`risks[]` sections have no mockup to compare against — verify against this task's Action steps instead (grilling-resolved layout), not pixels the design doesn't contain.

#### T-10: Wire `PrBriefCard` into `OverviewTab` below the two-column grid

- **Action:** In `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` add `const { data: briefData, isLoading: briefLoading } = useBrief(prId)` and `const generateBrief = useGenerateBrief()`, build a `regenerateButton` (`<Button kind="secondary" size="sm" icon="RefreshCw" loading={generateBrief.isPending} onClick={() => generateBrief.mutate(prId)}>` — the `loading` prop gives the non-dismissible spinner, AC-7), and render `<PrBriefCard briefData={briefData} briefLoading={briefLoading} regenerateButton={regenerateButton} onGoToDiff={onGoToDiff} changedFiles={changedFiles} repoFullName={repoFullName} headSha={headSha} />` AFTER the `<div style={s.gridTwoCol}>…</div>` block (AC-16 — below the grid), before/around the existing Description section. Do NOT modify `IntentCard`/`BlastRadiusCard` usage (AC-17). Update `OverviewTab.test.tsx` for the new card presence + placement.
- **Why:** Satisfies R16 (placement below the grid) and completes R1/R3 wiring — the card is mounted with live data + regenerate.
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-11-why-risk-brief/design/01-overview-pr-brief.png` — the card sits below the Intent/Blast Radius grid (AC-16 placement).
- **Skills to use:** react-frontend-architecture, react-best-practices, react-testing-library, typescript-expert
- **Owned paths:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx`
- **Depends-on:** T-09 (component), T-08 (hooks)
- **Risk:** low
- **Known gotchas:** `OverviewTab` already receives `onGoToDiff`, `changedFiles`, `repoFullName`, `headSha` from the parent page (`page.tsx:152-159`) — thread them straight through; no `page.tsx` change needed. `PrBriefCard` lives under `OverviewTab/_components/` (owned by T-09) — this task only imports it. Do not touch the `IntentCard`/`BlastRadiusCard` render (AC-17).
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab"` and `cd client && pnpm typecheck` pass; the test asserts `PrBriefCard` renders after the `overview-grid` element (AC-16) and that `IntentCard`'s RISK AREAS still renders unchanged (AC-17). **Design fidelity:** a self-taken screenshot of the full Overview tab shows the brief card below the Intent/Blast grid, matching `design/01-overview-pr-brief.png` placement.

## Testing strategy
- Unit (server): `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — covers `assembler.test.ts`, `extractor.test.ts`.
- Integration (server): `cd server && pnpm exec vitest run src/modules/why-risk-brief/why-risk-brief.it.test.ts` (requires Docker) — routes, one-call/zero-call assertions, upsert, AC-8 fallback.
- UI: `cd client && pnpm exec vitest run "<PrBriefCard or OverviewTab path>"` and `cd client && pnpm typecheck` — never `pnpm test -- <filter>` (CLAUDE.md gotcha).
- Migration: `cd server && pnpm db:generate && pnpm db:migrate`.
- E2E: out of scope for this plan (spec defines no e2e flow) — note only.

## Risks & mitigations
- **Settings + discovery + spec-content wiring is the highest-risk seam (T-07).** The service must read settings, discovered docs, and file contents without violating the onion (no raw `container.db`). Mitigation: reuse `resolveContextSettings` (new), `getDiscovery`/`scanRepoDocs`, and `readGuardedFile` — all cited to real call sites; keep the pure selection/assembly logic in T-05 so T-07 is orchestration only.
- **`completeStructured` vs `complete` (AC-8).** Using `completeStructured` would throw on mismatch and break the non-5xx contract. Mitigation: Recommendation + T-06 known-gotcha mandate `complete()` + `safeParse` — **confirmed in `grilling` 2026-07-11**.
- **Design GAPs (what/why/risk_level header, risks[] list styling).** The mockup only grounds the review-focus rows. **Resolved in `grilling` 2026-07-11**: header order is risk_level chip (left) + what/why → risks[] chips (IntentCard RISK AREAS style) → review_focus[] (last); unlinked risks show a text label instead of a chevron/file-link. See Design audit + T-09.
- **Default feature-model provider/model + label unspecified.** Mitigation: Recommendation proposes `openai`/`gpt-4.1` — **confirmed in `grilling` 2026-07-11**.
- **Two independent risk lists by design (IntentCard RISK AREAS vs PrBriefCard risks[]).** Accepted tradeoff per spec Edge cases — not a bug; T-09 keeps them separate (AC-17).
- **Out-of-scope discoveries:** none observed that expand scope; the dead `PrBrief` type and shipped Risks/`pr_brief`/`risk_brief` are explicitly left untouched.

## Red-flags check
- [x] Execution mode is stated (multi-agent) — confirmed by requester in `grilling` 2026-07-11
- [x] Every line in Requirements traces to the approved spec's AC/SC/Assumptions — nothing originated here
- [x] Recommendations are separated from Requirements; all three confirmed by requester in `grilling` 2026-07-11
- [x] Global constraints have no internal contradictions (AC-16 sub-section placement reconciled with the mockup's separate-card via the spec's confirmed decision)
- [x] Every requirement maps to a task (R1→T-07/T-09/T-10; R2→T-09; R3→T-06/T-07/T-08; R4→T-05/T-07; R5→T-01/T-06; R6→T-06; R7→T-09/T-10; R8→T-06/T-07; R9→T-09; R10/R11→T-09; R12→T-04/T-07; R13→T-05; R14→T-05/T-07; R15→T-05/T-07; R16→T-09/T-10; R17→T-09; R18→T-06/T-09; R19→T-05/T-06/T-07; R20→T-01/T-02/T-03)
- [x] Dependencies form a DAG (no cycles)
- [x] Concurrent tasks have non-overlapping Owned paths and parent directories (T-01∥T-03 differ; T-02 sequenced after T-01 to avoid concurrent `contracts/` writes; backend module tasks T-05→T-06→T-07 sequential; client T-08→T-09→T-10 sequential)
- [x] No phase exceeds ~7 concurrent tasks
- [x] No task split by activity type forcing concurrent same-file edits (impl+tests colocated per task)
- [x] Every cited path verified with Read/Glob or marked (NEW FILE)
- [x] Every task description names exact file paths
- [x] Every task is self-contained (contract ref, owned paths, acceptance)
- [x] Every Acceptance is a runnable, binary command/observation
- [x] Each phase produces a self-consistent, mergeable state
- [x] Shared contract changes update both vendor copies in the same task (T-01, T-02)
- [x] Schema change includes `pnpm db:generate` + `pnpm db:migrate` (T-03)
- [x] Integration edge-cases are explicit: AC-6/AC-18 in T-06, AC-8 in T-06/T-07, AC-13 injection guard in T-05, AC-14/AC-15 in T-05, zero-LLM read in T-07
- [x] UI design audit completed at style level; the two un-grounded elements were flagged as GAPs and resolved by the requester in `grilling` 2026-07-11 (not silently invented)
- [x] Design assets referenced by path from the source spec's `design/` folder (not duplicated, not prose); every UI task with a design origin carries a `Design ref:`
- [x] Orphan contracts: every new `@devdigest/shared` schema has an implementation task; the dead `PrBrief` type is explicitly out of scope
