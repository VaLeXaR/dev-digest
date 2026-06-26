# Development Plan: Intent UI gaps + Risk Brief feature

## Overview
The INTENT panel diverges from the design mockup: the intent summary renders as a plain
paragraph (no quotes), the IN SCOPE / OUT OF SCOPE chips lack their ✓/✗ icons, and the
RISK AREAS section is entirely missing — no backend module, no client hook, no UI. This plan
delivers the missing Risk Brief feature end-to-end (repository → service → routes → hook → UI)
and applies the three intent visual fixes. No DB migration and no new shared contracts are
required: `pr_brief`, `Risk`, `Risks`, and the `risk_brief` feature-model entry already exist.

## Requirements
- R1: Add `getRisks(prId)` and `upsertRisks(prId, risks)` repository methods to `ReviewRepository`
  reading/writing the `pr_brief` table (PK `prId`, field `json` storing the `Risks` shape `{ risks: Risk[] }`).
- R2: Create `server/src/modules/risks/` with `extractor.ts` (pure `buildRisksInput` + `callRisksLLM`
  with safe default), `service.ts` (`RisksService.get` / `.generate`), and `routes.ts`
  (`GET /pulls/:id/risks` → 404 when null; `POST /pulls/:id/risks/generate`).
- R3: Register the `risks` module in `server/src/modules/index.ts`.
- R4: Add `useRisks(prId)` and `useGenerateRisks()` hooks to `client/src/lib/hooks/brief.ts`.
- R5: Render the RISK AREAS section in `OverviewTab.tsx` below out_of_scope: section label +
  risk chips with severity icon (high=AlertOctagon red, medium=AlertTriangle orange,
  low=Lightbulb muted) + a Generate button when no risks exist yet.
- R6: Visual fixes in `OverviewTab.tsx`: quote the intent summary (`"..."`), prepend ✓ icon to
  IN SCOPE chips, prepend ✗ icon to OUT OF SCOPE chips.
- R7: Add i18n keys under `intent` in `client/messages/en/prReview.json`: `riskAreas`,
  `generateRisks`, `recalcRisksError`, `emptyRisks`.
- R8: Add risk chip style variants to `OverviewTab/styles.ts`: `chipRiskHigh`, `chipRiskMedium`,
  `chipRiskLow`.
- R9 (constraint, not in original list): Add `PrRisksRecord = Risks.extend({ pr_id })` to
  `server/src/vendor/shared/contracts/review-api.ts` AND sync the identical change to
  `client/src/vendor/shared/contracts/review-api.ts` in the same task.

## Design audit
| Panel  | Element                          | Requirement |
| ------ | -------------------------------- | ----------- |
| Intent | Summary quote style              | R6          |
| Intent | IN SCOPE chips with ✓ icon        | R6          |
| Intent | OUT OF SCOPE chips with ✗ icon    | R6          |
| Intent | RISK AREAS section header         | R5, R7      |
| Intent | Risk chips with severity icon     | R5, R8      |
| Intent | Generate risks button             | R5, R7      |

Orphan-contract check: `Risk` / `Risks` Zod schemas in `@devdigest/shared` are consumed by R1/R2
(persistence + LLM validation) and R9 (transport record). No orphan schemas remain.

## Affected modules & contracts
- `server` — new `risks` module (extractor/service/routes), one new repository method pair on
  `ReviewRepository` (via `reviews/repository/pull.repo.ts`), module registration.
- `client` — new hooks, OverviewTab UI, styles, i18n.
- Contracts: **no new files**. One additive export (`PrRisksRecord`) appended to the existing
  `review-api.ts` in BOTH vendor copies. `pr_brief` table and `Risk`/`Risks`/`risk_brief`
  already exist — no migration, no schema edit.

## Architecture notes
- Onion placement (server): `routes.ts` → `RisksService` → `ReviewRepository` → db. The service
  may NOT import Drizzle or `db/schema` directly; all DB access goes through new repo methods.
  Mirror `IntentService` exactly (constructs `new ReviewRepository(container.db)`).
- The `pr_brief` table stores an opaque JSONB blob. `upsertRisks` writes `{ risks }` (the `Risks`
  shape) into `json`; `getRisks` reads it back and `Risks.safeParse`s it, returning `undefined`
  on miss or parse failure (a partially-written legacy blob must not crash the GET).
- LLM call uses `llm.complete()` (NOT `completeStructured()`) and degrades to `{ risks: [] }` on
  any failure, exactly like `callIntentLLM`. Validate each array item with `Risk.safeParse` and
  drop items that fail, so a single bad item doesn't void the whole response.
- Transport record mirrors `PrIntentRecord`: `PrRisksRecord = Risks.extend({ pr_id: z.string() })`.
  The service returns `{ ...risks, pr_id }`; GET returns 404 when `getRisks` is `undefined`.
- Client: new `useRisks` query must carry `enabled: !!prId` + `retry: false`; `useGenerateRisks`
  mutation must carry `onError: () => notify.error(...)` and invalidate `["risks", prId]`.
- UI severity → icon mapping is risk-specific (`high`/`medium`/`low`), not the `SEV` table (which
  keys on `CRITICAL`/`WARNING`/...). Define a local `RISK_ICON` map: high→`AlertOctagon`,
  medium→`AlertTriangle`, low→`Lightbulb`, choosing the same lucide icons `SEV` uses.

## INSIGHTS summary
- [server] Use `llm.complete()` not `completeStructured()`; return safe default `{ risks: [] }` on parse error.
- [server] `resolveFeatureModel(container, workspaceId, 'risk_brief')` → `{ provider, model }`, then `await container.llm(provider)`.
- [server] Onion invariant: service → `ReviewRepository` → db; no raw Drizzle in the service.
- [server] `container.github()` is async — must be awaited (risks generation needs no GitHub enrichment, so it can be skipped entirely).
- [server] Build multi-line prompt strings via a string array `.join()` — the Edit tool corrupts ASCII quotes in `.ts`.
- [client] Every PR-scoped `useQuery` needs `enabled: !!prId` + `retry: false`; every mutation needs `onError: () => notify.error(...)`.
- [client] `PrRisksRecord` belongs in `contracts/review-api.ts` (next to `PrIntentRecord`), not `contracts/brief.ts`.
- [client] Import path from `OverviewTab/` to `lib/` is 7 `../` levels (`../../../../../../../lib/hooks/brief`).
- [client] Edit tool corrupts ASCII single-quotes → Unicode in `.tsx`/`.ts`; run a PowerShell fix after any Edit touching string literals.
- [client] Derive risk severity icons from the same lucide names `SEV` uses (`AlertOctagon`/`AlertTriangle`/`Lightbulb`).

## Phased tasks

> Phase 1 lands the contract + server feature (self-consistent and mergeable on its own — the
> endpoint works and returns a typed record). Phase 2 lands the client wiring + visual fixes,
> which depend on the contract and endpoint from Phase 1.

### Phase 1 — Contract + server Risk Brief

#### T-01: Add `PrRisksRecord` to both vendor copies of `review-api.ts`

- **Action:** In `server/src/vendor/shared/contracts/review-api.ts`, after the existing
  `PrIntentRecord` block, add: import `Risks` from `./brief.js` (extend the existing
  `import { Intent, SmartDiff } from './brief.js'` to also import `Risks`), then export
  `export const PrRisksRecord = Risks.extend({ pr_id: z.string() });` and
  `export type PrRisksRecord = z.infer<typeof PrRisksRecord>;`. Apply the **identical** change to
  `client/src/vendor/shared/contracts/review-api.ts`. Both files are byte-identical today and must
  stay in sync. The `@devdigest/shared` barrel already re-exports `review-api.js`, so no barrel edit.
- **Why:** Satisfies R9. The server service return type and the client hook type both depend on
  this record existing before they can be written.
- **Module:** server (+ client vendor copy)
- **Type:** backend
- **Skills to use:** zod, typescript-expert
- **Owned paths:** `server/src/vendor/shared/contracts/review-api.ts`, `client/src/vendor/shared/contracts/review-api.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** `Risks` lives in `contracts/brief.ts`; import it via the existing
  `./brief.js` import line. Keep both copies identical — a drift breaks the manual-sync invariant.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` passes; `cd client && pnpm typecheck` passes;
  `grep -c PrRisksRecord` returns the same nonzero count in both files.

#### T-02: Add `getRisks` / `upsertRisks` repository methods

- **Action:** In `server/src/modules/reviews/repository/pull.repo.ts`, add two exported functions
  after the intent block: `upsertRisks(db, prId, risks: Risks)` — `insert into t.prBrief`
  values `{ prId, json: risks }` with `.onConflictDoUpdate({ target: t.prBrief.prId, set: { json: risks } })`;
  and `getRisks(db, prId): Promise<Risks | undefined>` — select the row, `Risks.safeParse(row.json)`,
  return `parsed.success ? parsed.data : undefined`, and `undefined` when no row. Import `Risks`
  (value, for `safeParse`) from `@devdigest/shared`. Then surface both on `ReviewRepository` in
  `server/src/modules/reviews/repository.ts` under a new `// ---- risks ----` block, delegating to
  `pullRepo.getRisks` / `pullRepo.upsertRisks` (mirror the existing `getIntent`/`upsertIntent` pair).
- **Why:** Satisfies R1. The service can only read/write risks through the repository (onion rule);
  without this the service would have to touch Drizzle directly.
- **Module:** server
- **Type:** backend
- **Skills to use:** drizzle-orm-patterns, onion-architecture-node, typescript-expert
- **Owned paths:** `server/src/modules/reviews/repository/pull.repo.ts`, `server/src/modules/reviews/repository.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** `pr_brief` already exists in `server/src/db/schema/reviews.ts` and is exported
  via `db/schema.ts` as `t.prBrief` — do NOT add a migration or edit the schema. `json` is an
  untyped JSONB column, so `getRisks` MUST `Risks.safeParse` before returning (a legacy/partial blob
  must not crash). Repository is the only layer allowed to touch `db/schema`.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` passes; `cd server && npm run depcruise`
  reports 0 errors.

#### T-03: Create the `risks` extractor (pure helpers + LLM call)

- **Action:** Create `server/src/modules/risks/extractor.ts`. Reuse the intent hunk-header pattern:
  export `buildRisksInput(args: { title: string; body: string | null; files: { path: string; patch: string | null }[] }): string`
  that emits PR Title + optional PR Body + per-file blocks containing only hunk-header lines
  (lines matching `/^@@.+@@/`). Build all multi-line strings via a string array `.join('\n')`
  (Edit tool corrupts ASCII quotes). Export `callRisksLLM(input, llm: LLMProvider, model: string): Promise<Risks>`:
  call `llm.complete({ model, messages: [system, user], temperature: 0.2, maxTokens: 1024 })`; the
  system prompt asks for ONLY a JSON object `{ "risks": [{ "kind": string, "title": string, "severity": "high"|"medium"|"low" }] }`;
  slice between first `{` and last `}`, `JSON.parse` in a try/catch, then for each array item run
  `Risk.safeParse(item)` filling `explanation: ''` and `file_refs: []` when absent — keep only items
  that pass. Return `{ risks: keptItems }`; return the safe default `{ risks: [] }` on empty text,
  missing braces, parse error, or non-array `risks`.
- **Why:** Satisfies the extractor half of R2. Isolating pure prompt-building + parsing keeps the
  service thin and makes the safe-default behaviour unit-testable.
- **Module:** server
- **Type:** backend
- **Skills to use:** zod, typescript-expert, security
- **Owned paths:** `server/src/modules/risks/extractor.ts`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** Use `llm.complete()` NOT `completeStructured()` — schema mismatch must never
  throw. The flash model may emit `explanation`/`file_refs`; coerce missing ones to `''`/`[]` before
  `Risk.safeParse` since both are required in the `Risk` schema. Build prompt strings with array
  `.join()`. `INJECTION_GUARD` in `reviewer-core/prompt.ts` is the sole injection defence — do not
  add keyword scanning here.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` passes; `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
  passes (no regressions).

#### T-04: Create `RisksService` + `risks` routes and register the module

- **Action:** Create `server/src/modules/risks/service.ts` mirroring `IntentService`:
  `RisksService` constructed with `Container`, holding `new ReviewRepository(container.db)`.
  `get(prId, workspaceId): Promise<PrRisksRecord | null>` — `getPull` (throw `NotFoundError` when
  missing), `getRisks(prId)`, return `null` when undefined else `{ ...risks, pr_id: prId }`.
  `generate(prId, workspaceId): Promise<PrRisksRecord>` — `getPull` (throw when missing),
  `getPrFiles`, `buildRisksInput({ title, body, files })` (NO GitHub enrichment),
  `resolveFeatureModel(container, workspaceId, 'risk_brief')`, `await container.llm(provider)`,
  `callRisksLLM`, `upsertRisks(prId, risks)`, return `{ ...risks, pr_id: prId }`.
  Create `server/src/modules/risks/routes.ts` mirroring intent routes: `GET /pulls/:id/risks`
  (`schema: { params: IdParams }`, 404 when `get` returns null) and `POST /pulls/:id/risks/generate`.
  Use `getContext(app.container, req)` for `workspaceId`. Finally, in
  `server/src/modules/index.ts` add `import risksRoutes from './risks/routes.js';` and the
  `risksRoutes` entry in the `modules` record.
- **Why:** Satisfies the service+routes half of R2 and R3. Exposes the endpoints the client hooks
  (T-06) consume.
- **Module:** server
- **Type:** backend
- **Skills to use:** fastify-best-practices, onion-architecture-node, zod, typescript-expert
- **Owned paths:** `server/src/modules/risks/service.ts`, `server/src/modules/risks/routes.ts`, `server/src/modules/index.ts`
- **Depends-on:** T-01, T-02, T-03
- **Risk:** medium
- **Known gotchas:** `container.github()` is async — risks need no GitHub data, so skip it entirely
  (simpler than intent). Routes are Zod-first via `fastify-type-provider-zod` — no manual
  `Schema.parse()` in handlers. Service must not import Drizzle or `db/schema`. `IdParams`
  (`{ id: uuid }`) is in `server/src/modules/_shared/schemas.ts`.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` passes; `cd server && npm run depcruise`
  reports 0 errors; `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` passes.

### Phase 2 — Client hooks, RISK AREAS UI, and intent visual fixes

#### T-05: Add `riskAreas` / `generateRisks` / `recalcRisksError` / `emptyRisks` i18n keys

- **Action:** In `client/messages/en/prReview.json`, under the existing `"intent"` object (which
  currently has `title`, `inScope`, `outOfScope`, `recalculate`, `recalcError`, `empty`), add:
  `"riskAreas": "Risk areas"`, `"generateRisks": "Generate"`, `"recalcRisksError": "Failed to generate risks"`,
  `"emptyRisks": "No risks yet — click Generate to analyze this PR"`. Valid JSON, trailing-comma-free.
- **Why:** Satisfies R7. The RISK AREAS UI (T-07) reads these keys via `t("intent.*")`.
- **Module:** client
- **Type:** ui
- **Skills to use:** typescript-expert
- **Owned paths:** `client/messages/en/prReview.json`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Keys are namespaced under `intent` because the component calls
  `useTranslations("prReview")` then `t("intent.riskAreas")`.
- **Acceptance:** `cd client && pnpm typecheck` passes; the file parses as valid JSON
  (`node -e "require('./client/messages/en/prReview.json')"` exits 0).

#### T-06: Add `chipRiskHigh` / `chipRiskMedium` / `chipRiskLow` styles

- **Action:** In `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/styles.ts`,
  add three `CSSProperties` chip variants mirroring the existing `chipIn`/`chipOut` shape
  (`display: inline-flex`, `alignItems: center`, `gap: 5`, `padding: "3px 10px"`, `borderRadius: 6`,
  `fontSize: 12`, `fontWeight: 500`, plus border/background/color per severity):
  `chipRiskHigh` → red (`var(--crit, #ef4444)` border/text, `var(--crit-bg)` background),
  `chipRiskMedium` → orange (`var(--warn, #f59e0b)`), `chipRiskLow` → muted
  (`var(--border)` border, `var(--bg-elevated)` background, `var(--text-secondary)` text).
- **Why:** Satisfies R8. T-07 maps each risk's severity to one of these style objects.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-frontend-architecture, typescript-expert
- **Owned paths:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/styles.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Edit tool corrupts ASCII single-quotes → Unicode in `.ts`; run a PowerShell
  fix after editing if any literal quotes change. Match the existing `as const` / `satisfies CSSProperties`
  pattern in the file.
- **Acceptance:** `cd client && pnpm typecheck` passes.

#### T-07: Add `useRisks` / `useGenerateRisks` hooks

- **Action:** In `client/src/lib/hooks/brief.ts`, add `import type { PrRisksRecord } from "@devdigest/shared";`
  to the existing type import, then export `useRisks(prId: string | null | undefined)` —
  `useQuery({ queryKey: ["risks", prId ?? ""], queryFn: () => api.get<PrRisksRecord>(\`/pulls/${prId!}/risks\`), enabled: !!prId, retry: false })`;
  and `useGenerateRisks()` — `useMutation({ mutationFn: (prId: string) => api.post<PrRisksRecord>(\`/pulls/${prId}/risks/generate\`), onSuccess: (_d, prId) => qc.invalidateQueries({ queryKey: ["risks", prId] }), onError: () => notify.error("Failed to generate risks") })`
  (reuse the existing `useQueryClient`, `api`, `notify` imports). Mirror `useIntent`/`useRecalculateIntent` exactly.
- **Why:** Satisfies R4. T-08 consumes these to render and trigger risk generation.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-best-practices, react-frontend-architecture, typescript-expert
- **Owned paths:** `client/src/lib/hooks/brief.ts`
- **Depends-on:** T-01
- **Risk:** low
- **Known gotchas:** PR-scoped `useQuery` must carry `enabled: !!prId` + `retry: false` (404 = no
  risks yet → empty state, no spin/retry). Mutation must carry `onError: () => notify.error(...)`.
  `PrRisksRecord` is exported from `@devdigest/shared` (via `review-api.ts`), added in T-01.
- **Acceptance:** `cd client && pnpm typecheck` passes; `cd client && pnpm test` passes (no regressions).

#### T-08: Render RISK AREAS + apply intent visual fixes in `OverviewTab.tsx`

- **Action:** Edit
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`.
  (a) **R6 fixes:** wrap the intent summary in quotes — render `{`"${intentData.intent}"`}` (or add
  `::before`/`::after` content via style) so it reads `"..."`; prepend a ✓ icon to each IN SCOPE chip
  (`<Icon name="Check" size={12} />` inside the existing `chipIn` span) and a ✗ icon to each OUT OF
  SCOPE chip (`<Icon name="X" size={12} />` inside `chipOut`). Use the project `Icon`/icon component
  from `@devdigest/ui`.
  (b) **R5 RISK AREAS:** call `const { data: risksData, isLoading: risksLoading } = useRisks(prId);`
  and `const genRisks = useGenerateRisks();`. Below the out_of_scope block (still inside the intent
  `<section>`), add a RISK AREAS group: a `SectionLabel`-or `chipGroupLabel` header reading
  `t("intent.riskAreas")`; when `risksData?.risks?.length` render a `chipRow` of risk chips, each
  selecting `s.chipRiskHigh` / `chipRiskMedium` / `chipRiskLow` by `risk.severity` and prefixing a
  severity icon from a local `const RISK_ICON: Record<RiskSeverity, IconName> = { high: "AlertOctagon", medium: "AlertTriangle", low: "Lightbulb" }`,
  showing `risk.title`; when empty (and not loading) render `t("intent.emptyRisks")` plus a Generate
  button (`<Button kind="secondary" size="sm" icon="Sparkles" loading={genRisks.isPending} onClick={() => genRisks.mutate(prId)}>{t("intent.generateRisks")}</Button>`).
- **Why:** Satisfies R5 and R6 — the only remaining design-audit gaps (summary quotes, chip icons,
  RISK AREAS section, risk chips, Generate button).
- **Module:** client
- **Type:** ui
- **Skills to use:** react-best-practices, react-frontend-architecture, typescript-expert
- **Owned paths:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`
- **Depends-on:** T-05, T-06, T-07
- **Risk:** medium
- **Known gotchas:** Import path from `OverviewTab/` to `lib/` is 7 `../` levels
  (`../../../../../../../lib/hooks/brief`). Derive risk icons from the same lucide names `SEV` uses
  (`AlertOctagon`/`AlertTriangle`/`Lightbulb`); `RiskSeverity` is `'high'|'medium'|'low'` from
  `@devdigest/shared`. Edit tool corrupts ASCII single-quotes → Unicode in `.tsx`; run a PowerShell
  fix after editing. Keep the component a pure function with logic in hooks — no derived state in
  `useState`.
- **Acceptance:** `cd client && pnpm test` passes; `cd client && pnpm typecheck` passes; rendered
  intent summary shows surrounding quotes, IN/OUT chips show ✓/✗ icons, and a RISK AREAS block
  renders (chips when risks exist, otherwise a Generate button).

## Testing strategy
- Unit (server): `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — covers extractor
  safe-default behaviour and no regressions.
- Onion gate (server): `cd server && npm run depcruise` — must stay at 0 errors after T-02/T-04.
- Integration (server, optional): `cd server && pnpm exec vitest run .it.test` (requires Docker) —
  exercises repo round-trip if an `.it.test.ts` is added; not required by this plan.
- UI: `cd client && pnpm test && pnpm typecheck`.
- E2E: not in scope; per `e2e/docs/flows.md` if a flow is later added.

## Risks & mitigations
- Flash model returns malformed or partial risk JSON — mitigated by `Risk.safeParse` per item +
  `{ risks: [] }` safe default in `callRisksLLM` (T-03); a bad item is dropped, never thrown.
- Legacy/partial blob already in `pr_brief.json` for a PR — mitigated by `Risks.safeParse` in
  `getRisks` returning `undefined` rather than crashing the GET (T-02).
- Vendor-copy drift between server and client `review-api.ts` — mitigated by making T-01 own both
  files in a single task with an identical-count acceptance check.
- Edit-tool quote corruption in `.ts`/`.tsx` — mitigated by building prompt strings via array
  `.join()` (T-03) and the PowerShell quote-fix note on every client Edit task.

## Red-flags check
- [x] Global Constraints have no internal contradictions (no migration / no new contracts is
      consistent with R1–R9; R9 is additive to an existing file).
- [x] Every requirement maps to a task (R1→T-02, R2→T-03+T-04, R3→T-04, R4→T-07, R5→T-08,
      R6→T-08, R7→T-05, R8→T-06, R9→T-01).
- [x] Dependencies form a DAG (T-01/T-02/T-03 roots; T-04←{T-01,T-02,T-03}; T-05/T-06 roots;
      T-07←T-01; T-08←{T-05,T-06,T-07}; no cycles).
- [x] Concurrent tasks have non-overlapping Owned paths and parent directories (T-02 `reviews/repository/*`
      vs T-03 `risks/extractor.ts` vs T-01 `vendor/shared/...` are disjoint; T-05/T-06/T-07 touch
      `messages/`, `OverviewTab/styles.ts`, `lib/hooks/brief.ts` respectively).
- [x] Every task description names exact file paths.
- [x] Every task is self-contained (carries contract ref, owned paths, runnable acceptance).
- [x] Every Acceptance is measurable with a runnable command.
- [x] Each phase produces a self-consistent, mergeable state (Phase 1: working endpoint; Phase 2:
      wired UI).
- [x] Shared contract change (T-01) updates both vendor copies in the same task.
- [x] Schema changes: none — `pr_brief` pre-exists; no `db:generate`/`db:migrate` needed (explicit
      constraint honoured).
- [x] Integration edge-cases are explicit: safe-default parsing is in T-03; 404-on-null is in T-04;
      legacy-blob safeParse is in T-02.
- [x] UI tasks: design audit completed — every visible element maps to a requirement.
- [x] Orphan contracts: `Risk`/`Risks` consumed by R1/R2/R9; no orphan schema remains.

## Note: T-08 ownership of OverviewTab also covers the OverviewTab/ directory
T-06 (`OverviewTab/styles.ts`) and T-08 (`OverviewTab/OverviewTab.tsx`) share the `OverviewTab/`
parent directory, so they are placed in the same phase but T-08 **Depends-on T-06** — they are NOT
run concurrently. This satisfies the non-overlapping-parent-directory rule for *concurrent* tasks.
