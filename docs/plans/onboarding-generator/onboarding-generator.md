# Development Plan: Onboarding Generator

## Overview

Add a repo-scoped **Onboarding Tour**: a new `server/src/modules/onboarding/` module that composes
existing deterministic repo-intel primitives into facts, wraps them as untrusted input, and makes
**exactly one** `completeStructured` LLM call returning a five-section `OnboardingTour` object
(architecture, criticalPaths, runLocally, readingPath, firstTasks) plus meta — persisted to the
already-existing `onboarding` table. A new client page at `repos/[repoId]/onboarding/` renders the
cached artifact with Markdown + Mermaid, Regenerate/Share actions, a header, and a new sidebar nav
item. Built from approved spec `specs/SPEC-2026-07-10-onboarding-generator/`.

## Execution mode

**Multi-agent (parallel implementers, strict Owned-path partitioning)** — **confirmed in
`grilling`**. The change is wide but cleanly separable into three domains (shared contracts, server
module, client route) with non-overlapping owned paths, so parallelism pays off. The server module
tasks form a short sequential chain (they share the `server/src/modules/onboarding/` directory), and
run in parallel with the client chain.

## Requirements

<!-- Each line traces to the approved spec SPEC-2026-07-10-onboarding-generator (AC-n cited). -->

- R1 (AC-1, AC-2): Generation makes **exactly one** `completeStructured` LLM call per generation
  producing all five section fields in one object — no per-section or additional round-trips.
- R2 (AC-3): Critical-paths file selection is computed deterministically as top-N by `file_rank.rank`
  DESC (junk excluded) before any LLM call.
- R3 (AC-4): Guided-reading-path ordering is computed deterministically from `getCriticalPaths`
  (import-graph dependency order), never alphabetical/by-date.
- R4 (AC-5): The deterministically-ordered file lists are passed to the LLM for annotation only; the
  LLM must not reorder them or introduce file entries not in the provided lists (unknown paths
  dropped server-side).
- R5 (AC-6): Every repo-authored fact (repo skeleton, README/`package.json` excerpts, file paths) is
  supplied to the prompt as an untrusted block governed by `INJECTION_GUARD`, never as instructions.
- R6 (AC-7, AC-8): If the single structured call fails to return all five required section fields
  after configured retries, generation fails with an error and persists nothing; any prior cached
  row is left unchanged.
- R7 (AC-9): On success, upsert into the `onboarding` table (PK `repoId`), overwriting the prior row
  and setting `generatedAt = now`.
- R8 (AC-10): Resolve the generation model via `resolveFeatureModel(container, workspaceId,
  'onboarding')` — workspace override else registry default.
- R9 (AC-11): If the repo has no completed index (empty rank/edges, or `repoIntelEnabled` false),
  return an "index-required" state and make **no** LLM call.
- R10 (AC-12, AC-21): Opening the page for a repo with a cached tour renders all five sections from
  cache with no new LLM call; for an indexed repo with no cached tour, show a generate empty-state
  (no auto-trigger).
- R11 (AC-13): The header shows the indexed-file count (`repo_index_state.filesIndexed`) and the
  tour's `generatedAt` as a relative "last refreshed" time.
- R12 (AC-14): Regenerate triggers a new generation that overwrites the cached tour and updates the
  displayed "last refreshed" time.
- R13 (AC-15, AC-16): Architecture prose renders via the escaping `Markdown` primitive; the diagram
  via `MermaidDiagram` (`securityLevel: "strict"`), which renders nothing on invalid Mermaid.
- R14 (AC-17, AC-27): Critical-paths list renders in server-provided ranked order — path, one-line
  annotation, and an Open action navigating to `githubBlobUrl(repoFullName, defaultBranch, path)`.
- R15 (AC-18, AC-20): "How to run locally" commands render in server order, numbered, each with a
  copy-to-clipboard control.
- R16 (AC-19): Guided-reading-path renders in server-provided ranked order, numbered, each with its
  one-line reason; never re-sorted alphabetically.
- R17 (AC-22): A new "Onboarding Tour" nav item appears in the WORKSPACE sidebar group.
- R18 (AC-23): All LLM-generated markdown renders through the escaping `Markdown` primitive (no
  `dangerouslySetInnerHTML`).
- R19 (AC-24): The persisted payload labels the "How to run locally" section as AI-generated so the
  client can display that its commands are model-generated (untrusted, not verified-safe).
- R20 (AC-25): `firstTasks` is an array of `{ title, rationale, relatedFiles? }` authored by the LLM
  within the same single call — no external issue-tracker/TODO integration in v1.
- R21 (AC-26): Share link copies the internal repo-scoped Onboarding Tour URL to the clipboard; no
  public/anonymous variant is exposed in v1.
- R22 (AC-28): Persist `repo_index_state.lastIndexedSha` as `meta.indexedAtSha`; when the repo's
  current `lastIndexedSha` differs, the client shows a non-blocking "may be stale" hint without
  auto-regenerating.
- R23 (AC-29): If a deterministic section's underlying data is empty but the section key is present
  in the LLM output, generation succeeds and the client renders that section's empty-state (this is
  NOT the AC-7 failure path — that is reserved for a missing section field).
- R24 (AC-30): While a Regenerate request is in flight, the Regenerate action is disabled until it
  settles.
- R25 (AC-31): On each generation attempt (success or failure), the server logs one structured line
  with `model`, `tokensIn`, `tokensOut`, `costUsd` from the single call; a test asserts
  `completeStructured` is invoked exactly once per generation via a mock call-count spy.

## Recommendations

All three confirmed in `grilling` — adopted as stated, no open items remain:

- Add a live `currentIndexedSha` field to the GET-tour response DTO (T-01) — R22/AC-28 requires
  comparing the cached `meta.indexedAtSha` against the repo's **current** `lastIndexedSha`, but the
  cached payload only holds the value at generation time. The GET endpoint reads
  `getIndexState(repoId).lastIndexedSha` live and returns it beside the cached tour.
- Reuse the single shared `INJECTION_GUARD` by exporting it from `reviewer-core` (T-02) rather than
  re-authoring a guard string inside the onboarding module — keeps the "one shared, trusted defense"
  invariant (`reviewer-core/src/prompt.ts:11-16`, `server/CLAUDE.md`).
- Model the GET/generate responses as a discriminated union (`ready` | `not_generated` |
  `index_required`) rather than nullable fields — it makes R9/R10 states unambiguous for the client.

## Design references

<!-- Inherited by reference from the approved spec's own design/ folder — not duplicated here, per
     the "do not duplicate a spec's design assets" convention (.claude/agents/implementation-planner.md). -->

| File | Shows |
| --- | --- |
| `specs/SPEC-2026-07-10-onboarding-generator/design/onboarding-tour-overview.png` | Full page: WORKSPACE sidebar with active "Onboarding Tour" item; header "Onboarding for {repo}" + "Generated from index of {N} files · last refreshed {t} ago" + Regenerate / Share link; "ON THIS PAGE" anchor nav (5 entries); Architecture overview (Markdown prose + Mermaid node diagram); Critical paths (path + annotation + Open); start of How-to-run-locally |
| `specs/SPEC-2026-07-10-onboarding-generator/design/onboarding-tour-run-locally-reading-path.png` | How to run locally (numbered commands, each with copy button, inline `#` comment) and Guided reading path (numbered file list, one-line reason each) |
| `specs/SPEC-2026-07-10-onboarding-generator/design/onboarding-tour-empty-state.png` | **Added during `grilling` (2026-07-10).** The AC-21 not-generated empty state: centered glyph icon, "Generate onboarding tour" title, description ("DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens."), single "+ Generate onboarding tour" CTA button; no header Regenerate/Share actions, no "ON THIS PAGE" nav in this state |

## Design audit

<!-- Style-level enumeration per panel; every element maps to an AC. All GAP rows from the initial
     audit were resolved in `grilling` (2026-07-10) — resolutions below, no open items remain. -->

| Panel | Element (style-level) | Design file | Requirement |
| --- | --- | --- | --- |
| Sidebar | "Onboarding Tour" item in WORKSPACE group, between "Pull Requests" and "Project Context"; **active/selected** state (accent background, node-graph/molecule glyph icon) | overview | R17 / AC-22 |
| Header | "Onboarding for `{repo}`" title, repo name in accent-mono | overview | R11 / AC-13 |
| Header | Subtitle "Generated from index of 12,450 files · last refreshed 2h ago" (muted) | overview | R11 / AC-13 |
| Header | "Regenerate" button (circular-arrow icon, outline) top-right | overview | R12 / AC-14 |
| Header | "Share link" button (link icon, outline) top-right, right of Regenerate | overview | R21 / AC-26 |
| Header | "may be stale" hint — **not depicted; resolved in `grilling`:** muted inline text appended to the same subtitle line, e.g. `"... last refreshed 2h ago · index has changed since"` — no new visual element, shown only when `currentIndexedSha !== meta.indexedAtSha` | overview | R22 / AC-28 |
| Content L-col | "ON THIS PAGE" anchor nav listing all 5 sections; Architecture overview active (accent left-border) — **resolved in `grilling`:** build as scroll-spy anchor nav (highlight nearest section to viewport top, click-to-scroll); hidden in empty/index-required states (no sections to navigate) | overview | build as shown (no AC; confirmed in scope) |
| Architecture card | Icon + "Architecture overview" title + collapse chevron (up); Markdown prose with inline `code` chips | overview | R13 / AC-15 |
| Architecture card | Bordered box with Mermaid flowchart (nodes: client, server.ts, middleware, redis, api/public/*, postgres; colored node borders) | overview | R13 / AC-15, AC-16 |
| Critical paths card | Icon + title + chevron; rows = file icon + mono path + " — " + annotation + right-aligned "Open" (outline) button | overview | R14 / AC-17, AC-27 |
| Run-locally card | Icon + title + chevron; numbered rows = number + mono command (with inline `#` comment) + right-aligned copy icon button | overview + run-locally | R15 / AC-18, AC-20 |
| Run-locally card | "AI-generated" label — **not depicted; resolved in `grilling`:** small muted caption under the card title, e.g. `"AI-generated · review before running"` — always visible, no banner | run-locally | R19 / AC-24 |
| Reading-path card | Icon + title + chevron; numbered entries = badge number + bold mono path + newline + muted one-line reason | run-locally | R16 / AC-19 |
| First tasks card | Listed in "ON THIS PAGE" nav but the panel itself is **not depicted; resolved in `grilling`:** mirror sibling-card styling exactly (icon+title+chevron header; rows = bold title + muted rationale + optional `relatedFiles` rendered as file chips reusing the Critical-paths row's Open-action pattern) | overview | R20 / AC-25 |
| Card behavior | Every card shows a collapse chevron (expanded state) — **resolved in `grilling`:** functional collapse/expand (click chevron toggles section visibility, local component state, default expanded) | overview | build as functional (no AC; confirmed in scope) |
| States | AC-21 not-generated (empty generate) state — **depicted, added in `grilling`:** see `onboarding-tour-empty-state.png` (centered icon/title/description/CTA, no header actions, no ON-THIS-PAGE nav) | empty-state | R10 / AC-21 |
| States | AC-11 index-required state — **not separately depicted; resolved in `grilling`:** identical layout to the empty-state mockup, swapped copy (title "Index required", description explaining the repo needs indexing first), **no CTA button** (indexing is a separate out-of-scope flow) | empty-state (adapted) | R9 / AC-11 |

## Affected modules & contracts

- `server/src/modules/onboarding/` (NEW) — facts composition, prompt build, single LLM call, merge,
  persistence, routes, observability.
- `server/src/modules/index.ts` — register the new module (one import + one entry).
- `reviewer-core/src/prompt.ts` + `reviewer-core/src/index.ts` — export `INJECTION_GUARD`
  (`wrapUntrusted` is already exported at `reviewer-core/src/index.ts:17`).
- `client/src/app/repos/[repoId]/onboarding/` (NEW) — the page + section components.
- `client/src/lib/hooks/onboarding.ts` (NEW) + `client/src/lib/hooks/index.ts` — data hooks + barrel.
- `client/src/vendor/ui/nav.ts` — new nav item + `SHORTCUTS` entry.
- `client/messages/en/onboarding.json` — **already exists** and is scaffolded for this feature
  (has `title` "Onboarding Tour", `regenerate`, `generate.cta`, `loadError`); extend it, do not create
  a new namespace.
- Contracts: NEW `contracts/onboarding.ts` in **both** vendor copies
  (`server/src/vendor/shared/contracts/` and `client/src/vendor/shared/contracts/`) + barrel export
  in both `vendor/shared/index.ts`.

## Architecture notes

- **Already-satisfied infra (verified — no task needed):**
  - **`onboarding` table + migration exist and are committed.** Declaration
    `server/src/db/schema/context.ts:120-126` (`repoId` PK uuid FK→repos cascade, `json` jsonb NOT
    NULL, `generatedAt` timestamptz default now); created by `server/src/db/migrations/0000_init.sql:205-209`
    and exported from the barrel `server/src/db/schema.ts:22`. **No `db:generate`/`db:migrate` work.**
    (Confirms the spec's flagged drift concern does not apply to this table.)
  - **`onboarding` `FeatureModelId` + `FEATURE_MODELS` entry already present in BOTH vendor copies:**
    `server/src/vendor/shared/contracts/platform.ts:14-51` and
    `client/src/vendor/shared/contracts/platform.ts:14-51` (id `onboarding`, label "Onboarding Tour",
    default `openrouter` / `deepseek/deepseek-v4-flash`). **AC-10 registration is pre-satisfied**; the
    service just calls `resolveFeatureModel(container, workspaceId, 'onboarding')`
    (`server/src/modules/settings/feature-models.ts:51-57`, returns `{provider, model}`; then
    `container.llm(provider)`). No `platform.ts` edit is in scope.
- **repo-intel return shapes differ from the spec's interface prose (verified via source read).** The
  facts-composition task (T-03) must account for:
  - `getTopFilesByRank(repoId, n, opts?)` returns **`string[]` (paths only)** — NOT objects with
    rank/percentile (`server/src/modules/repo-intel/service.ts:669-686`; junk excluded via
    `isJunkPath`). To get `rankPercentile`, call `getFileRank(repoId, paths)` → `{path, percentile}[]`
    separately. To get `fanIn`, call `getEdges(repoId)` → `{fromFile, toFile}[]`
    (`repository.ts:474`) and tally per `toFile` in JS (no dedicated fan-in method exists).
  - `getCriticalPaths(repoId)` returns **`string[][]` (dependency chains, each ≤3 nodes)** — NOT a
    flat list (`service.ts:693-732`, `CRITICAL_PATH_ROOTS=5`, `BFS_DEPTH=2`). The reading-path order
    (R3/R16) must be derived by flattening + deduping these chains into a single ordered path list.
  - `getRepoMap(repoId)` returns `RepoMapResult { text, tokens, cached, degraded?, reason? }` and
    **never null** (`service.ts:428-445`); on unavailable data `text:''`, `degraded:true`.
  - **Index-required gate (R9/AC-11):** use `container.repoIntel.getIndexState(repoId)` → always
    resolves `IndexState { status, filesIndexed, lastIndexedSha, degraded?, degradedReason? }`
    (`service.ts:197-213`). Treat "indexed" as `!degraded && filesIndexed > 0`; on no row it
    synthesizes `{ degraded:true, filesIndexed:0, lastIndexedSha:'' }`. This is also the source of
    `meta.filesIndexed` (R11) and `meta.indexedAtSha` (R22).
  - **`getTopFilesByRank` and `getCriticalPaths` are concrete on `RepoIntelService` but NOT declared
    on the `RepoIntel` interface** (`server/src/modules/repo-intel/types.ts:137-160`). If the
    onboarding module types its dependency as the `RepoIntel` interface these two methods are
    invisible → TS error. The implementer must either type against the concrete `RepoIntelService` or
    extend the `RepoIntel` interface. Prefer typing against the concrete service class within the
    module to avoid editing the shared interface (out of this module's scope).
- **Two-schema design (LLM output vs. persisted payload).** The Zod schema handed to
  `completeStructured` should validate only the LLM-authored content (section annotations, prose,
  diagram, commands, tasks). The persisted `OnboardingTour` is assembled server-side by **merging**
  the LLM annotations onto the deterministically-ordered file lists (dropping any LLM path not in the
  provided list — R4/AC-5) and attaching server-computed `meta` (filesIndexed, generatedAt,
  indexedAtSha). Keep the deterministic ordering authoritative; never re-sort by LLM output.
- **Onion placement.** Transport (`routes.ts`) → Application (`service.ts`) → Infrastructure
  (`repository.ts` over the `onboarding` table; deterministic reads via `container.repoIntel`). The
  service constructs `new ReviewRepository(container.db)` for the repo-metadata lookup
  (owner/full_name/default_branch, needed by the client for the Open action) and a new
  `OnboardingRepository(container.db)` for tour read/write — mirroring `RisksService`
  (`server/src/modules/risks/service.ts:8-13`). Routes never import `db/schema` or adapters directly.
- **Single source of untrusted-wrapping.** `wrapUntrusted(label, content)` is exported
  (`reviewer-core/src/index.ts:17`); `INJECTION_GUARD` is module-private in
  `reviewer-core/src/prompt.ts:16` → T-02 exports it so T-03 can prepend it to the onboarding system
  prompt while wrapping each repo-authored fact via `wrapUntrusted`.
- **Client route pattern.** Repo-scoped page at `client/src/app/repos/[repoId]/onboarding/` mirrors
  the existing `client/src/app/repos/[repoId]/context/page.tsx`. Repo metadata (full_name,
  default_branch) and the active repoId come from `useActiveRepo()`
  (`client/src/lib/repo-context.tsx`). Nav item href `/repos/:repoId/onboarding` matches the
  repo-scoped `context` precedent (`nav.ts:26`).
- **`api.post` already supports a body-less generate POST** — `client/src/lib/api.ts:27-30` only sets
  `content-type: application/json` when a body is present, and returns `undefined` on 204
  (`api.ts:61`). No custom `postRaw` needed for the generate mutation.

## INSIGHTS summary

- [server]: `completeStructured` throws a validation error after its configured retries when output
  doesn't match the schema — this is the AC-7 failure path (2026-06-22).
- [server]: Adding a `FeatureModelId` means editing `platform.ts` both vendor copies — already done
  for `onboarding`; do not re-add (2026-07-02).
- [server]: The shared barrel is `vendor/shared/index.ts` (there is no `contracts/index.ts`); add
  `export * from './contracts/onboarding.js';` to both copies (2026-07-09).
- [server]: Vendor-sync drift is silent — after editing one `vendor/shared` copy, run an actual
  `diff` against the other; don't assume from git history (2026-07-09).
- [server]: Hermetic service/route tests mock via `vi.spyOn(SomeRepository.prototype, 'method')` +
  a fake `Container` (`db: {} as never`); stub `repoIntel` via `buildApp({ overrides: { repoIntel }})`
  (2026-07-02). For `resolveFeatureModel` mocks, set the resolved value in `beforeEach`, not inline in
  the mock factory, or `restoreAllMocks` clears it (2026-07-02).
- [server]: Verify a vitest run-filter against the actual landed filename — a substring like
  `onboarding.it.test` won't match `.../onboarding/routes.it.test.ts` because of the `/routes` in
  between; scope by directory `src/modules/onboarding` instead (2026-07-02).
- [client]: Every repo-scoped `useQuery` MUST include `enabled: !!repoId` or it fires `GET /repos//…`
  (2026-06-26).
- [client]: `MermaidDiagram` renders `null` on invalid input and is `securityLevel:"strict"`; this is
  its first production consumer (2026-07-05 / spec).
- [client]: `@testing-library/user-event` is NOT installed — use `fireEvent` in RTL tests (2026-07-02).
- [client]: `src/vendor/shared/` is a manual copy — contract changes go in both copies same task
  (2026-06-20).
- [client]: `app-shell/helpers.ts:29` maps any pathname containing `/onboarding` to shell context
  "onboarding-tour" (currently the Add-repository top-level `/onboarding`); verify the new repo-scoped
  route resolves to the correct breadcrumb/shell context and doesn't break the Add-repo flow (T-08
  cross-cutting check).
- [both]: On a shared machine under multi-agent load, `vitest run` can hang with zero output while
  `tsc` stays fast — that's machine contention, not a regression; verify via typecheck + manual trace
  rather than re-running (2026-07-09). Never use `pnpm test -- <filter>` in `client/` (orphan workers).

## Phased tasks

### Phase 1 — Shared foundation (parallelizable)

#### T-01: Onboarding contracts in both vendor copies

- **Action:** Create `contracts/onboarding.ts` in **both** `server/src/vendor/shared/contracts/` and
  `client/src/vendor/shared/contracts/` (identical content), and add
  `export * from './contracts/onboarding.js';` to **both** `server/src/vendor/shared/index.ts` and
  `client/src/vendor/shared/index.ts`. Define, with Zod:
  - `OnboardingTour` (persisted `onboarding.json` shape): `architecture: { summary: string, diagram:
    string }`; `criticalPaths: Array<{ path: string, rankPercentile: number, fanIn?: number, why:
    string }>`; `runLocally: { aiGenerated: literal(true) or boolean, commands: Array<{ command:
    string, comment?: string }> }` (carry the AI-generated label per R19/AC-24); `readingPath:
    Array<{ path: string, reason: string }>`; `firstTasks: Array<{ title: string, rationale: string,
    relatedFiles?: string[] }>`; `meta: { filesIndexed: number, generatedAt: string, indexedAtSha:
    string }`.
  - `OnboardingLlmOutput` — the subset the LLM authors (the schema passed to `completeStructured`):
    section annotations/prose only (`architecture.summary`, `architecture.diagram`, per-path `why`,
    per-path `reason`, `runLocally.commands`, `firstTasks`). Keep deterministic fields
    (rankPercentile/fanIn/ordering/meta) OUT of the LLM schema — the server attaches them.
  - Response DTOs (discriminated union recommended, R9/R10): `OnboardingGetResponse` =
    `{ state: 'ready', tour: OnboardingTour, currentIndexedSha: string }` |
    `{ state: 'not_generated' }` | `{ state: 'index_required' }`; `OnboardingGenerateResponse` =
    `{ state: 'ready', tour, currentIndexedSha }` | `{ state: 'index_required' }`.
- **Why:** Satisfies the contract dependency for R1/R4/R6/R11/R19/R20/R22; every server and client
  task builds on these types. Without it those tasks cannot typecheck.
- **Module:** server + client (shared vendor) | **Type:** backend
- **Skills to use:** `zod`, `typescript-expert`
- **Owned paths:** `server/src/vendor/shared/contracts/onboarding.ts`,
  `client/src/vendor/shared/contracts/onboarding.ts`, `server/src/vendor/shared/index.ts`,
  `client/src/vendor/shared/index.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Barrel is `vendor/shared/index.ts`, not `contracts/index.ts`. Both copies MUST
  be byte-identical — run `diff` between them before finishing (silent vendor drift, server INSIGHTS
  2026-07-09).
- **Acceptance:** `cd server && pnpm exec vitest run src/vendor` and `cd server && pnpm typecheck`
  pass; `cd client && pnpm typecheck` passes; a `diff` of the two `contracts/onboarding.ts` files is
  empty; `OnboardingTour` and the response DTOs are importable from `@devdigest/shared` in both
  packages.

#### T-02: Export `INJECTION_GUARD` from reviewer-core

- **Action:** In `reviewer-core/src/prompt.ts`, change `const INJECTION_GUARD` (line 16) to an
  exported const (`export const INJECTION_GUARD`), and re-export it from the package barrel
  `reviewer-core/src/index.ts` (alongside the existing `wrapUntrusted` export at line 17). No behavior
  change — `assemblePrompt` continues to use it internally.
- **Why:** Satisfies R5/AC-6 — lets the onboarding prompt (T-03) reuse the single shared
  prompt-injection defense instead of re-authoring guard text. `server/CLAUDE.md` names
  `INJECTION_GUARD` the sole defense; sharing it preserves that invariant.
- **Module:** reviewer-core | **Type:** core
- **Skills to use:** `typescript-expert`, `security`
- **Owned paths:** `reviewer-core/src/prompt.ts`, `reviewer-core/src/index.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** `reviewer-core` `build` = typecheck only (emits no JS). Do not modify
  `grounding.ts` or the guard text itself — only its export visibility.
- **Acceptance:** `cd reviewer-core && npm run typecheck` and `npm test` pass; `INJECTION_GUARD` is
  importable from `@devdigest/reviewer-core`.

### Phase 2 — Server onboarding module (sequential chain; runs parallel to Phase 3)

#### T-03: Deterministic facts + untrusted prompt builder

- **Action:** Create `server/src/modules/onboarding/facts.ts` and
  `server/src/modules/onboarding/prompt.ts` (pure functions, no I/O beyond the injected
  `RepoIntelService`), plus `facts.test.ts` and `prompt.test.ts`.
  - `facts.ts`: given a repoId + the repo-intel service, compute the deterministic fact bundle with
    **zero LLM calls**: index gate via `getIndexState(repoId)` (indexed = `!degraded && filesIndexed >
    0`); top-N critical-path files via `getTopFilesByRank(repoId, N)` (returns `string[]`) enriched
    with percentile via `getFileRank(repoId, paths)` and fan-in via aggregating `getEdges(repoId)` by
    `toFile`; reading-path order by flattening + deduping `getCriticalPaths(repoId)` (`string[][]`
    chains) into one ordered path list; repo skeleton via `getRepoMap(repoId).text`; and `meta`
    (filesIndexed, indexedAtSha) from the index state. Type the repo-intel dependency against the
    concrete `RepoIntelService` (the `RepoIntel` interface does not declare `getTopFilesByRank` /
    `getCriticalPaths` — see Architecture notes).
  - `prompt.ts`: build the `ChatMessage[]` for `completeStructured` — a trusted system message
    prepending `INJECTION_GUARD` (imported from `@devdigest/reviewer-core`, T-02) with the task
    framing, and a user message that wraps EVERY repo-authored fact (skeleton, file paths, any
    README/package excerpts) via `wrapUntrusted(label, content)`; instruct the model to annotate the
    provided ordered lists only and not reorder or add paths (R4/AC-5).
- **Why:** Satisfies R2/R3/R5/R9's deterministic precomputation and R4's annotate-only framing; this
  is the "0 LLM calls in precomputation" foundation for R1.
- **Module:** server | **Type:** backend
- **Skills to use:** `onion-architecture-node`, `typescript-expert`, `security`, `zod`
- **Owned paths:** `server/src/modules/onboarding/facts.ts`,
  `server/src/modules/onboarding/prompt.ts`, `server/src/modules/onboarding/facts.test.ts`,
  `server/src/modules/onboarding/prompt.test.ts`
- **Depends-on:** T-01, T-02
- **Risk:** medium
- **Known gotchas:** `getTopFilesByRank` → `string[]` (no rank/percentile) — must separately call
  `getFileRank` for percentile and aggregate `getEdges` for fan-in. `getCriticalPaths` → `string[][]`
  chains (not a flat list). `getRepoMap` never returns null (degraded → `text:''`). `getIndexState`
  synthesizes a degraded state (filesIndexed:0, lastIndexedSha:'') when unindexed. `getTopFilesByRank`
  / `getCriticalPaths` are concrete-only on `RepoIntelService`, not on the `RepoIntel` interface.
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/onboarding/facts.test.ts
  src/modules/onboarding/prompt.test.ts` passes; tests assert (a) an unindexed repo (degraded index
  state) yields the index-required signal with no fact bundle; (b) reading-path order equals the
  flatten-dedup of the `getCriticalPaths` chains; (c) every repo-authored fact string in the built
  prompt is enclosed in an `<untrusted…>` block and the system message contains `INJECTION_GUARD`.

#### T-04: Repository, service (single LLM call, merge, persist, observability)

- **Action:** Create `server/src/modules/onboarding/repository.ts`,
  `server/src/modules/onboarding/service.ts`, and `service.test.ts`.
  - `repository.ts`: `OnboardingRepository(db)` with `getTour(repoId): Promise<OnboardingTour | null>`
    (reads the `onboarding` table row's `json`) and `upsertTour(repoId, tour)` (upsert on PK `repoId`,
    set `generatedAt = now`).
  - `service.ts`: `OnboardingService(container)`. `get(repoId, workspaceId)` → returns
    `OnboardingGetResponse` (`index_required` when not indexed; `not_generated` when indexed but no
    row; else `ready` with the cached tour + live `currentIndexedSha` from `getIndexState`). No LLM
    call in `get` (R10/AC-12). `generate(repoId, workspaceId)` → build facts (T-03); if not indexed
    return `index_required` with **no** LLM call (R9/AC-11); else resolve model via
    `resolveFeatureModel(container, workspaceId, 'onboarding')`, `container.llm(provider)`, make
    **exactly one** `completeStructured({ schema: OnboardingLlmOutput, … })` call; on schema failure
    after retries, throw and persist nothing, leaving the prior row intact (R6/AC-7/AC-8); on success,
    merge LLM annotations onto the deterministic ordered lists — dropping any LLM path not in the
    provided list (R4/AC-5) — attach `meta`, set `runLocally.aiGenerated` (R19/AC-24), upsert
    (R7/AC-9), and log ONE structured line with `model/tokensIn/tokensOut/costUsd` from the
    `StructuredResult` (R25/AC-31). Treat empty-but-present deterministic sections as success
    (R23/AC-29). Use `ReviewRepository(container.db)` for the repo-metadata/existence lookup.
- **Why:** Satisfies R1/R4/R6/R7/R8/R9/R10/R19/R23/R25 — the core single-call generation, merge, and
  persistence.
- **Module:** server | **Type:** backend
- **Skills to use:** `onion-architecture-node`, `drizzle-orm-patterns`, `typescript-expert`,
  `security`, `zod`
- **Owned paths:** `server/src/modules/onboarding/repository.ts`,
  `server/src/modules/onboarding/service.ts`, `server/src/modules/onboarding/service.test.ts`
- **Depends-on:** T-03, T-01
- **Risk:** high
- **Known gotchas:** `completeStructured` throws on schema mismatch after retries (AC-7 path, server
  INSIGHTS 2026-06-22). Hermetic test: `vi.spyOn(OnboardingRepository.prototype, …)` +
  `vi.spyOn(ReviewRepository.prototype, 'getRepo')`, fake `Container` with `db: {} as never`, and a
  mock `LLMProvider` whose `completeStructured` is a `vi.fn()`; set `resolveFeatureModel` mock value
  in `beforeEach` (server INSIGHTS 2026-07-02). AC-31 test asserts the mock `completeStructured` was
  called exactly once per `generate`.
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/onboarding/service.test.ts` passes;
  tests assert (a) `completeStructured` called exactly once per successful generation (call-count
  spy, R25/AC-31); (b) an index-required repo triggers zero `completeStructured` calls (R9/AC-11);
  (c) a schema-mismatch throw persists nothing and leaves a pre-seeded row unchanged (R6/AC-7/AC-8);
  (d) an LLM path absent from the provided ranked list is dropped from the merged `criticalPaths`
  (R4/AC-5); (e) one structured log line records model/tokensIn/tokensOut/costUsd (R25/AC-31).

#### T-05: Routes + module registration + integration test

- **Action:** Create `server/src/modules/onboarding/routes.ts` exporting a default Fastify plugin with
  `GET /repos/:id/onboarding` (returns `service.get`) and `POST /repos/:id/onboarding/generate`
  (returns `service.generate`), using `IdParams` (`../_shared/schemas.js`) and `getContext`
  (`../_shared/context.js`) exactly like `server/src/modules/conventions/routes.ts`. Register the
  module in `server/src/modules/index.ts` (one import + one entry `onboarding`). Add
  `server/src/modules/onboarding/routes.it.test.ts` (DB-backed) covering the GET/generate wiring,
  workspace scoping, and the index-required / not-generated / ready states.
- **Why:** Satisfies R1/R7/R9/R10's HTTP surface; without routes the client has no endpoints. Keeps
  integration edge-cases (workspace scoping, state markers) in an explicit `.it.test.ts` task.
- **Module:** server | **Type:** backend
- **Skills to use:** `fastify-best-practices`, `onion-architecture-node`, `zod`, `typescript-expert`
- **Owned paths:** `server/src/modules/onboarding/routes.ts`,
  `server/src/modules/onboarding/routes.it.test.ts`, `server/src/modules/index.ts`
- **Depends-on:** T-04
- **Risk:** medium
- **Known gotchas:** Routes may not import `db/schema`/adapters directly (onion). Match the service
  method arg order positionally — do not copy a sibling module's `(workspaceId, id)` vs `(id,
  workspaceId)` order from memory (server INSIGHTS 2026-07-09). `.it.test.ts` needs Docker Postgres;
  seed a fresh workspace rather than reusing the demo seed (server INSIGHTS 2026-07-02).
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/onboarding/routes.it.test.ts` passes
  (requires Docker); `cd server && pnpm typecheck` passes; `GET /repos/:id/onboarding` on an
  unindexed repo returns the `index_required` state with no LLM call.

### Phase 3 — Client onboarding page (runs parallel to Phase 2 after T-01)

#### T-06: Sidebar nav item + shortcut

- **Action:** In `client/src/vendor/ui/nav.ts`, add an "Onboarding Tour" item to the WORKSPACE group
  **between** `pulls` and `context` (`{ key: "onboarding", label: "Onboarding Tour", icon: <existing
  IconName matching the design's node-graph/molecule glyph>, href: "/repos/:repoId/onboarding", gKey:
  "o" }`) and a matching `SHORTCUTS` entry (`{ keys: "g o", label: "Go to Onboarding Tour", group:
  "Navigation" }`). `o` is unused (`p`, `x`, `s`, `a`, `c`, `,` are taken).
- **Why:** Satisfies R17/AC-22 — the sidebar entry point.
- **Module:** client | **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-10-onboarding-generator/design/onboarding-tour-overview.png` —
  WORKSPACE sidebar, "Onboarding Tour" active item position and glyph.
- **Skills to use:** `react-frontend-architecture`, `typescript-expert`
- **Owned paths:** `client/src/vendor/ui/nav.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** `icon` must be an existing `IconName` from `@devdigest/ui` (indexing a
  non-existent icon is a runtime miss). gKey/shortcut wiring auto-derives from the nav definition
  (client INSIGHTS 2026-06-26) — no separate wiring needed.
- **Acceptance:** `cd client && pnpm typecheck` passes; the nav renders an "Onboarding Tour" item in
  WORKSPACE linking to `/repos/:repoId/onboarding`; a self-taken screenshot of the sidebar visually
  matches the cited design (item placement between Pull Requests and Project Context, active-state
  styling).

#### T-07: Data hooks

- **Action:** Create `client/src/lib/hooks/onboarding.ts` with `useOnboarding(repoId)` (`useQuery`,
  `queryKey: ["onboarding", repoId]`, `enabled: !!repoId`, `retry: false`, `GET
  /repos/${repoId}/onboarding`) and `useRegenerateOnboarding()` (`useMutation`, `POST
  /repos/${repoId}/onboarding/generate`, `onSuccess` invalidates `["onboarding", repoId]`, `onError`
  → `notify.error`). Export both from the barrel `client/src/lib/hooks/index.ts`. Type payloads with
  the T-01 DTOs from `@devdigest/shared`.
- **Why:** Satisfies the client-data dependency for R10/R12/R24; the page consumes these hooks. The
  mutation's `isPending` drives the Regenerate-disabled state (R24/AC-30).
- **Module:** client | **Type:** ui
- **Skills to use:** `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`
- **Owned paths:** `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/index.ts`
- **Depends-on:** T-01
- **Risk:** low
- **Known gotchas:** Repo-scoped `useQuery` MUST set `enabled: !!repoId` (client INSIGHTS
  2026-06-26). Body-less generate POST is fine through `api.post` (api.ts already omits content-type
  when no body and returns undefined on 204).
- **Acceptance:** `cd client && pnpm typecheck` passes; hooks are importable from
  `client/src/lib/hooks`; `useOnboarding` issues no request while `repoId` is falsy.

#### T-08: Onboarding Tour page + section components + i18n

- **Action:** Create the route subtree `client/src/app/repos/[repoId]/onboarding/` (`page.tsx` + a
  colocated `_components/` tree with its own `*.test.tsx`) and extend the existing
  `client/messages/en/onboarding.json` namespace. Render, from `useOnboarding` (T-07) via
  `useActiveRepo()` for repoId + repo metadata:
  - **States (all three per the empty-state mockup + `grilling`):**
    - `index_required` (R9/AC-11): centered icon, title "Index required", description that the repo
      needs indexing first, **no CTA button**. No header actions, no ON-THIS-PAGE nav.
    - `not_generated` (R10/AC-21): centered icon, title "Generate onboarding tour", the mockup's
      description copy, single "+ Generate onboarding tour" CTA (calls `useRegenerateOnboarding`, no
      auto-trigger). No header actions, no ON-THIS-PAGE nav.
    - `ready`: full page below.
  - **ON-THIS-PAGE nav** (left column, `ready` state only): scroll-spy anchor nav over the 5 sections,
    highlighting the section nearest the viewport top, click-to-scroll.
  - **Header** (`ready` state): "Onboarding for `{repo}`", subtitle "Generated from index of
    `{meta.filesIndexed}` files · last refreshed `{relative(meta.generatedAt)}` ago" (R11/AC-13),
    appending `" · index has changed since"` (muted, same line, no new element) when
    `currentIndexedSha !== meta.indexedAtSha` (R22/AC-28); a Regenerate button (calls
    `useRegenerateOnboarding`, disabled while `isPending` — R24/AC-30, R12/AC-14); a Share-link button
    copying the current internal URL to the clipboard (R21/AC-26).
  - **Sections** (`ready` state, each card: icon + title + **functional** collapse chevron, local
    open/closed state, default expanded): Architecture (`Markdown` prose + `MermaidDiagram` for
    `architecture.diagram`, which self-omits on invalid input — R13/AC-15/AC-16); Critical paths
    (server order, path + `why` + Open action → `githubBlobUrl(repo.full_name, repo.default_branch,
    path)` — R14/AC-17/AC-27); How-to-run-locally (server order, numbered, per-command
    copy-to-clipboard, inline `comment`, plus a small muted caption under the card title —
    `"AI-generated · review before running"` — driven by `runLocally.aiGenerated` — R15/AC-18/AC-20,
    R19/AC-24); Guided reading path (server order, numbered, `reason` each, never re-sorted —
    R16/AC-19); First tasks (mirrors the sibling-card pattern exactly: bold title + muted rationale +
    optional `relatedFiles` as file chips reusing the Critical-paths row's Open-action pattern —
    R20/AC-25). All LLM markdown via the escaping `Markdown` primitive (R18/AC-23).
- **Why:** Satisfies R9–R24 client rendering. This is the user-facing surface of the whole feature.
- **Module:** client | **Type:** ui
- **Design ref:** three files —
  `specs/SPEC-2026-07-10-onboarding-generator/design/onboarding-tour-overview.png` (sidebar, header,
  ON-THIS-PAGE nav, Architecture + Critical-paths cards),
  `.../onboarding-tour-run-locally-reading-path.png` (run-locally + reading-path cards), and
  `.../onboarding-tour-empty-state.png` (not_generated state; index_required reuses this layout with
  swapped copy and no CTA, per `grilling`). All Design-audit rows are resolved (see table above) — no
  open GAPs remain for this task.
- **Skills to use:** `react-frontend-architecture`, `react-best-practices`, `next-best-practices`,
  `react-testing-library`, `typescript-expert`, `zod`
- **Owned paths:** `client/src/app/repos/[repoId]/onboarding/`, `client/messages/en/onboarding.json`,
  `client/src/components/app-shell/helpers.ts` (conditional — only touch if the verification below
  finds it wrong for the new route; confirmed in scope for this task in `grilling`, not a separate
  follow-up)
- **Depends-on:** T-07, T-01
- **Risk:** high
- **Known gotchas:** `MermaidDiagram` is `"use client"`, `securityLevel:"strict"`, renders `null` on
  invalid input (client INSIGHTS 2026-07-05). Use `fireEvent`, not `userEvent` (not installed,
  2026-07-02). Extend the EXISTING `onboarding.json` namespace (already scaffolded with
  title/regenerate/generate keys) — do not create a new namespace. `app-shell/helpers.ts:29`
  (`if (pathname.includes("/onboarding")) return "onboarding-tour";`) treats any `/onboarding`
  pathname as shell context "onboarding-tour" — verify the repo-scoped route's breadcrumb/shell
  context is correct and the top-level Add-repo `/onboarding` (`app/page.tsx:36`,
  `RepoNotFound.tsx:20`, `useShellContext.ts:46,59`) still resolves correctly; fix `helpers.ts`
  in-task if the check is wrong for the new route (do not just flag it). On a shared machine, a
  `vitest run` hang with fast `tsc` is contention, not a regression.
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/onboarding"` and
  `cd client && pnpm typecheck` pass; a self-taken screenshot of the rendered `ready` state visually
  matches both `ready`-state design files element-by-element (header incl. stale hint when
  triggered, Architecture card with diagram, Critical-paths rows with Open, numbered run-locally with
  copy buttons + AI-generated caption, numbered reading-path, First-tasks card); a self-taken
  screenshot of `not_generated` matches `onboarding-tour-empty-state.png`; `index_required` renders
  the same layout with no CTA; Regenerate is disabled while a generate request is in flight
  (R24/AC-30); an invalid Mermaid string renders no diagram (R13/AC-16); collapsing a card's chevron
  hides that section's content and re-clicking restores it; the ON-THIS-PAGE nav's active entry
  tracks scroll position and clicking an entry scrolls to that section.

## Testing strategy

- Unit (server): `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
  (scope: `pnpm exec vitest run src/modules/onboarding`)
- Integration (server): `cd server && pnpm exec vitest run .it.test` (requires Docker)
- Core: `cd reviewer-core && npm test && npm run typecheck`
- UI: `cd client && pnpm test && pnpm typecheck`
  (scope a single task: `cd client && pnpm exec vitest run "src/app/repos/[repoId]/onboarding"` —
  never `pnpm test -- <filter>`)
- E2E: not in scope for this plan.

## Risks & mitigations

- **Spec interface prose vs. real repo-intel return shapes** — the spec's `criticalPaths`/`readingPath`
  field shapes assume richer return types than `getTopFilesByRank` (`string[]`) and `getCriticalPaths`
  (`string[][]`) provide. Mitigation (**confirmed in `grilling`**): T-03 explicitly derives percentile
  (`getFileRank`), fan-in (`getEdges` aggregation), and reading-path order (flatten/dedup chains);
  Architecture notes + T-03 gotchas document it.
- **`RepoIntel` interface omits the two methods T-03 needs** — typing against the interface breaks the
  build. Mitigation (**confirmed in `grilling`**): T-03 types against the concrete
  `RepoIntelService`, not the `RepoIntel` interface — no interface change, no risk to other consumers.
- **Undesigned UI elements (Design-audit GAPs)** — resolved in `grilling` (2026-07-10): stale hint →
  muted inline text on the header subtitle; AI-generated label → muted caption under the run-locally
  card title; First-tasks panel → mirrors sibling-card styling; empty/index-required states → a new
  mockup (`design/onboarding-tour-empty-state.png`) supplied by the requester, index-required reuses
  its layout with swapped copy and no CTA; ON-THIS-PAGE nav → build as functional scroll-spy; card
  collapse → build as functional toggle. All resolutions folded into T-08 above; no open GAPs remain.
- **Cross-tab regenerate race** — out of scope, **confirmed accepted in `grilling`**: last-write-wins
  on the single row; client-side in-flight disable (R24) only guards one session. No mitigation
  planned; documented.
- **`app-shell/helpers.ts` `/onboarding` substring match** — may mis-tag the new repo-scoped route or
  the Add-repo route. Mitigation (**confirmed in `grilling`**): T-08's owned paths now conditionally
  include `client/src/components/app-shell/helpers.ts` — T-08 verifies the check first and fixes it
  in-task if it's wrong for the new route, rather than only flagging it.

## Red-flags check

- [x] Execution mode stated (multi-agent) — **confirmed in grilling** (2026-07-10).
- [x] Every Requirements line traces to a spec AC — nothing originated by the planner.
- [x] Recommendations separated from Requirements and marked "needs requester confirmation".
- [x] Global constraints scanned — no internal contradiction (one LLM call, deterministic ordering,
      untrusted wrapping mutually consistent).
- [x] Every requirement maps to a task (R1–R25 across T-01..T-08; AC-10 pre-satisfied, evidenced).
- [x] Dependencies form a DAG: T-01,T-02 → T-03 → T-04 → T-05; T-01 → T-07 → T-08; T-06 independent.
- [x] Concurrent tasks have non-overlapping owned paths and parent dirs (server module chain is
      sequential; T-06/T-07/T-08 own distinct client paths; T-08 depends on T-07).
- [x] No phase exceeds ~7 concurrent tasks.
- [x] No task split by activity type in a way that forces two concurrent tasks onto the same files
      (each task owns its own tests).
- [x] Every cited path verified with Read/Glob or marked NEW.
- [x] Every task names exact file paths.
- [x] Every task self-contained (contract ref, owned paths, runnable acceptance).
- [x] Every acceptance is a runnable, binary check.
- [x] Each phase reaches a self-consistent state (Phase 1 contracts standalone; Phase 2 server chain
      compiles+tests at each step; Phase 3 client renders).
- [x] Shared contract changes update both vendor copies in the same task (T-01).
- [x] Schema changes: none — table + migration already committed (evidenced); no db:generate/migrate.
- [x] Integration edge-cases (workspace scoping, index-required/not-generated/ready states) are an
      explicit `.it.test.ts` task (T-05); AC-7/AC-8/AC-31 covered in T-04's service tests.
- [x] UI design audit completed at style level; every visible element mapped to an AC; all GAP rows
      raised in the initial audit were resolved in `grilling` (2026-07-10) — none silently resolved in
      favor of old behavior, and one new design asset (`onboarding-tour-empty-state.png`) was supplied
      by the requester mid-interview and persisted to the spec's `design/` folder.
- [x] Design assets inherited by reference from the spec's `design/` folder (not duplicated); Design
      references section lists all three files; every design-derived UI task (T-06, T-08) carries a
      `Design ref:`.
- [x] Orphan contracts: `OnboardingTour` / `OnboardingLlmOutput` / response DTOs (T-01) are all
      consumed by T-04/T-05 (server) and T-07/T-08 (client). The pre-existing `onboarding`
      `FeatureModelId` is consumed by T-04 via `resolveFeatureModel`. No orphans.
