# Development Plan: Intent Layer

## Overview
The Intent Layer classifies a PR's purpose with a cheap flash-class LLM *before* the review
runs, stores the result per-PR, injects it into every review agent prompt as scope guidance, and
surfaces it as a card in the PR Overview tab. Input is intentionally cheap: PR title + body +
linked issue + changed-file list with hunk headers only (no patch bodies), so we log the token
savings vs. a full diff. Most building blocks already exist (table, contracts, repository methods,
feature-model entry) — this plan wires them into a new `intent` module, the reviewer-core prompt,
and the client UI.

## Requirements
- R1: Intent extractor — a separate LLM call using the `review_intent` feature model
  (flash-class via OpenRouter) that returns `Intent { intent, in_scope, out_of_scope }` from
  PR title + body + linked issue (title+body) + **resolved plan/spec content** (if any) + changed
  files with **hunk headers only**, and logs `tokensIn` saved vs. the full diff.
  A missing or empty PR body is not an error — intent is still inferred from title + files alone.
  When the PR body contains a plan/spec inline or links to one (GitHub issue/PR URL), that content
  is fetched and used as the primary intent signal.
- R2: Storage — per-PR 1:1, recalculable on demand (uses the existing `pr_intent` table +
  `upsertIntent`/`getIntent`). No new migration.
- R3: Intent injection into reviews — add an optional `intent` field to reviewer-core's
  `ReviewInput`, render a `## PR Intent` section in `assemblePrompt` after PR description, and add
  a scope rule to the system prompt ("do not comment outside intent scope; one signal finding for
  a serious out-of-scope issue, not twenty").
- R4: API endpoints — `GET /pulls/:id/intent` (return stored intent or 404) and
  `POST /pulls/:id/intent/generate` (generate/regenerate, persist, return).
- R5: Client UI — Intent card in the Overview tab showing summary + in_scope + out_of_scope chips,
  with a "Recalculate" button.
- R6: Model settings — change the `review_intent` default from `openai`/`gpt-4.1` to an
  OpenRouter flash-class model (`google/gemini-2.0-flash-001`).
- R7: run-executor loads the stored intent once before the agent loop and passes it to every
  `ReviewInput`; absence of intent never blocks a review.

## Affected modules & contracts
- `server` — new `src/modules/intent/` module (extractor + service + routes), registered in
  `modules/index.ts`; `review_intent` default model changed in `feature-models.ts`/`platform.ts`;
  `run-executor.ts` loads + threads intent into `reviewPullRequest`.
- `reviewer-core` — `ReviewInput.intent` field (`review/run.ts`), `PromptParts.intent` +
  `## PR Intent` section + scope rule in `prompt.ts`.
- `client` — Intent card in `OverviewTab`; new `lib/hooks/brief.ts`; i18n keys.
- Contracts: **none new** — `Intent` (`brief.ts`) and `PrIntentRecord` (`review-api.ts`) already
  exist in both vendor copies. The only contract-adjacent change is the `review_intent`
  `defaultModel`/`defaultProvider` value in `platform.ts` (shared, both copies). It is data inside
  an existing array, not a schema-shape change, but still lives in `src/vendor/shared` and must be
  synced to both copies (see T-09).

## Architecture notes
- **Module placement (decision):** a new `server/src/modules/intent/` module that mirrors the
  `conventions` precedent (`extractor.ts` + `service.ts` + `routes.ts`). The existing intent
  repository methods (`upsertIntent`/`getIntent`) already live on `ReviewRepository`; the intent
  service reuses them through `container` rather than duplicating CRUD — so no new repository file.
- **Onion layering:** routes → service → (extractor pure-ish helper + `ReviewRepository`) →
  Drizzle. The extractor receives a resolved `LLMProvider` and plain data; it does no DB/GitHub
  I/O itself (the service gathers inputs and calls `container.github()`), keeping the LLM-shaped
  logic testable in isolation like `conventions/extractor.ts`.
- **Input assembly (decision):** PR title/body come from the `pull_requests` row; changed files +
  hunk headers come from the `pr_files` table (`path` + `patch`, no extra GitHub call for the diff).
  The **linked issue is NOT persisted** in DB — fetched best-effort via `getPullRequest`.
  **Empty/missing PR body is explicitly valid** — the model infers from title + file names + hunk
  headers; no special handling needed.
  **Plan/spec resolution** (in `resolvePlanContent`): if the body contains a structured plan inline
  (>200 chars + task/spec keywords), that body IS the plan content. If the body contains a GitHub
  issue or PR URL, the service fetches that document's body via the GitHub adapter and uses it as
  plan content (truncated to 8 000 chars). Fallback: null (proceed without). All fetches are
  best-effort (try/catch) — generation never blocks on plan resolution.
- **Hunk-header extraction (decision):** a pure helper strips everything except `@@ … @@` lines
  from each file's `patch`, so the extractor input contains file paths + hunk ranges but no changed
  source lines. This is the core token saving and is unit-testable without an LLM.
- **Token logging (decision):** the extractor returns `tokensIn` (the prompt token count of the
  cheap input) alongside the parsed `Intent`; the service `console.log`s it next to an estimate of
  the full-diff token count (sum of `patch` lengths / 4) so the saving is observable. No new DB
  column.
- **reviewer-core injection (decision):** `PromptParts.intent?: { summary; inScope; outOfScope }`
  rendered as a `## PR Intent` section after `## PR description`, delimiter-wrapped via
  `wrapUntrusted` (it is derived data). The scope *rule* goes into the system prompt as a separate
  trusted addition appended in `assemblePrompt` (NOT inside INJECTION_GUARD — the guard is the
  injection defense and must not be diluted with scope policy). INJECTION_GUARD already names
  "derived intent/scope" as untrusted data, so the precedence is already correct.
- **Quote-corruption gotcha:** any new multi-line prompt string in `prompt.ts` MUST be built as a
  string array joined with `.join(' ')` (the INJECTION_GUARD pattern), not a single quoted literal,
  to avoid the Edit-tool Unicode-quote corruption documented in reviewer-core INSIGHTS.

## INSIGHTS summary
- [server]: `resolveFeatureModel(container, workspaceId, 'review_intent')` → `{ provider, model }`,
  then `container.llm(provider)` — the exact pattern used by `ConventionsService.extract()`.
- [server]: `ReviewRepository` is a thin manual wrapper — `upsertIntent`/`getIntent` are already
  exposed (`repository.ts:130-136`), so no new repo method or class edit is needed for intent.
- [server]: For LLM extraction that must degrade gracefully on bad JSON, use `llm.complete()` (raw
  text + manual `JSON.parse`), NOT `completeStructured()` which throws on schema mismatch.
- [server]: LLM JSON often has preamble — locate the first `{`/`[` and last `}`/`]` before parsing;
  reasoning models may return empty `content` (already fixed in the OpenRouter adapter, but the
  empty-text guard + Settings hint is the established response).
- [reviewer-core]: New multi-line prompt strings must be arrays joined with `.join(' ')` — the Edit
  tool corrupts ASCII single quotes to Unicode quotes and breaks `tsc`.
- [reviewer-core]: `INJECTION_GUARD` already classifies "derived intent/scope" as untrusted data;
  the intent section must be `wrapUntrusted`-wrapped, and scope policy goes in the trusted system
  prompt, not in the guard.
- [client]: `src/vendor/shared/` is a manual copy of the server contracts — any contract data
  change (the `review_intent` default) must be applied to both copies in the same task.
- [client]: every PR-scoped `useQuery` hook MUST include `enabled: !!prId`; every mutation MUST
  have `onError: () => toast.error(...)` (silent-failure regression precedent in `ConventionsView`).

## Phased tasks

> Each phase reaches a self-consistent, mergeable state. Phase 1 delivers a working generate/get
> API. Phase 2 makes reviews consume the intent. Phase 3 adds the UI. Phases are sequential where
> noted; tasks within a phase with non-overlapping Owned paths run concurrently.

### Phase 1 — Server: extractor, service, endpoints, model default

#### T-01: Hunk-header + intent-input helpers (pure)

- **Action:** Create `server/src/modules/intent/extractor.ts`. Implement and export:
  (1) `extractHunkHeaders(patch: string | null): string[]` — returns only lines matching
  `/^@@ .* @@/` from the patch (empty array when patch is null/empty);
  (2) `buildIntentInput(args: { title: string; body: string | null; planContent: string | null;
  issue: { title: string; body: string | null } | null; files: { path: string; patch: string | null }[] })` →
  a single prompt string. **A missing or empty `body` is not an error** — the model must still
  derive intent from title + changed files + hunk headers alone (implicit signals are often enough).
  Include sections in this order: PR title; PR body (omit section entirely when null/empty); Plan /
  spec content (omit when null — see T-03 for how it is resolved); linked-issue title+body (omit
  when null); per-file block of `path` + its hunk headers. Never include raw patch bodies — hunk
  headers only;
  (3) `estimateTokens(text: string): number` returning `Math.ceil(text.length / 4)`.
  Do NOT call any LLM, DB, or GitHub here — pure string functions only.
- **Why:** Satisfies R1's "hunk headers only" + token-saving requirement; isolating the pure logic
  makes it unit-testable without an LLM (conventions precedent). Explicit graceful-degradation for
  empty body means the extractor never refuses to work — it infers from whatever signals are present.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, typescript-expert
- **Owned paths:** `server/src/modules/intent/extractor.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Build the system/user prompt template as a string array joined with
  `.join('\n')`/`.join(' ')` rather than one long quoted literal, to avoid Edit-tool Unicode-quote
  corruption (reviewer-core INSIGHTS). `body: null` must produce a valid (smaller) prompt, not an
  empty string or error.
- **Acceptance:** New file `server/src/modules/intent/extractor.test.ts` covers:
  `extractHunkHeaders` (multi-hunk patch → only `@@` lines; null patch → `[]`);
  `buildIntentInput` with full args (has all sections); with `body: null` and `planContent: null`
  and `issue: null` (still produces a non-empty prompt from title + files alone); with
  `planContent` set (includes plan section); never contains a non-`@@` patch line.
  `cd server && pnpm exec vitest run intent/extractor` passes; `pnpm exec tsc --noEmit` clean.

#### T-02: Intent LLM call (`callIntentLLM`)

- **Action:** In `server/src/modules/intent/extractor.ts` (same file as T-01) add and export
  `async callIntentLLM(input: string, llm: LLMProvider, model: string): Promise<{ intent: Intent;
  tokensIn: number }>`. Build a system prompt instructing the model to classify the PR's intent
  and return JSON `{ intent: string, in_scope: string[], out_of_scope: string[] }`. Call
  `llm.complete({ model, messages, temperature: 0.2, maxTokens: 1024 })`. Parse with the
  first-`{`/last-`}` slice strategy, validate with a Zod schema matching the `Intent` shape
  (snake_case `in_scope`/`out_of_scope`), and on empty text or parse failure return a safe default
  `{ intent: '', in_scope: [], out_of_scope: [] }`. Set `tokensIn = estimateTokens(input)`.
- **Why:** Satisfies R1 — the actual flash-class classification call with graceful degradation.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, zod, typescript-expert
- **Owned paths:** `server/src/modules/intent/extractor.ts`
- **Depends-on:** T-01
- **Risk:** medium
- **Known gotchas:** Use `llm.complete()` not `completeStructured()` (the latter throws on schema
  mismatch and breaks the safe-default contract). Strip preamble by slicing first `{` … last `}`.
  Guard empty `text` (reasoning models). Import `Intent` and `LLMProvider` from `@devdigest/shared`.
- **Acceptance:** Extend `server/src/modules/intent/extractor.test.ts`: a stubbed `LLMProvider`
  returning valid JSON (possibly with preamble) yields the parsed `Intent`; one returning garbage
  yields the safe default and does not throw. `cd server && pnpm exec vitest run intent/extractor`
  passes.

#### T-03: IntentService (orchestration + plan/spec resolution + token-saving log)

- **Action:** Create `server/src/modules/intent/service.ts` exporting `class IntentService`
  constructed with `(container: Container)`. Methods:
  (1) `get(prId, workspaceId): Promise<PrIntentRecord | null>` — verify the PR belongs to the
  workspace (select from `pullRequests` by id+workspaceId; throw `NotFoundError` if missing), call
  `new ReviewRepository(container.db).getIntent(prId)`, return `{ ...intent, pr_id: prId }` or null;
  (2) `generate(prId, workspaceId): Promise<PrIntentRecord>` — full pipeline:

  **Step A — gather inputs (all best-effort, nothing blocks generation):**
  - Load the PR row (title/body) and its `pr_files` (path + patch) from DB via Drizzle.
  - Best-effort fetch `linked_issue` via `container.github().getPullRequest(...)` in try/catch.
  - **Plan/spec resolution** — extract plan or specification content from the PR body using the
    private helper `resolvePlanContent(body, github)`:
      (a) If the PR body is null/empty — `planContent = null` (no plan, that is fine; the model
          will infer from title + files alone).
      (b) If the body itself contains an explicit plan or specification (a structured list of tasks,
          a requirement breakdown, or similar structured text that is longer than the PR description
          itself) — `planContent = body` (the body IS the plan; no extra fetch needed).
      (c) If the body contains a GitHub issue or PR URL
          (`https://github.com/<owner>/<repo>/issues/<n>` or `/pull/<n>`) — fetch that document via
          `container.github().getIssue(...)` wrapped in try/catch; use its `body` as `planContent`
          (truncate to 8 000 chars to avoid ballooning the prompt).
      (d) Fallback: `planContent = null`.
    The helper tries (b) first (body length > 200 chars AND contains task/spec keywords), then (c).
    On any error the helper returns null.

  **Step B — build input, call LLM, log, persist:**
  - Call `buildIntentInput({ title, body, planContent, issue: linked_issue, files })`.
  - Resolve `resolveFeatureModel(container, workspaceId, 'review_intent')`, `container.llm(provider)`.
  - Call `callIntentLLM(input, llm, model)`.
  - `console.log` saved tokens: `tokensIn` (cheap input) vs
    `estimateTokens(files.map(f => f.patch ?? '').join('\n'))` (full diff equivalent).
  - Persist with `new ReviewRepository(container.db).upsertIntent(prId, intent)` and return the
    `PrIntentRecord`.

- **Why:** Satisfies R1+R2+R4 orchestration. The `resolvePlanContent` step ensures that when a PR
  links to a spec/plan document or embeds one inline, the extractor receives rich context instead of
  just the PR description — dramatically improving intent accuracy. Empty or missing body is an
  explicitly valid state; the model always runs.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, drizzle-orm-patterns, typescript-expert
- **Owned paths:** `server/src/modules/intent/service.ts`
- **Depends-on:** T-01, T-02
- **Risk:** medium
- **Known gotchas:** `ReviewRepository` already exposes `getIntent`/`upsertIntent` — reuse, do not
  add methods. `linked_issue` is not in DB — GitHub fetch is best-effort. `resolvePlanContent` must
  never throw (each branch in try/catch). Truncate fetched external content to ≤ 8 000 chars so a
  long spec does not exceed the flash-model's context. Resolve model via
  `resolveFeatureModel(container, workspaceId, 'review_intent')` then `container.llm(provider)`.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` clean. (Behavioral coverage of the wired
  endpoint is in T-05's integration test; specifically assert that when the PR body contains a
  GitHub issue URL, the generated intent is called with non-null `planContent`.)

#### T-04: Intent routes (Fastify plugin)

- **Action:** Create `server/src/modules/intent/routes.ts` exporting a default Fastify plugin
  (mirror `conventions/routes.ts`). Use `withTypeProvider<ZodTypeProvider>()`, instantiate
  `IntentService(app.container)`. Routes (both resolve `{ workspaceId }` via
  `getContext(app.container, req)` and use the shared `IdParams` schema):
  `GET /pulls/:id/intent` → `service.get(req.params.id, workspaceId)`; respond 404 (throw
  `NotFoundError`) when null. `POST /pulls/:id/intent/generate` → `service.generate(...)`.
  No business logic in the handlers.
- **Why:** Satisfies R4 — the two endpoints the client consumes.
- **Module:** server
- **Type:** backend
- **Skills to use:** fastify-best-practices, onion-architecture-node
- **Owned paths:** `server/src/modules/intent/routes.ts`
- **Depends-on:** T-03
- **Risk:** low
- **Known gotchas:** Zod-first route schemas only (`fastify-type-provider-zod`); never call
  `Schema.parse()` in a handler. Routes must not import `db/schema` or adapters directly — go
  through the service.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` clean; plugin exported as default. Wired in
  T-05; behavior verified by T-05's integration test.

#### T-05: Register intent module + integration test

- **Action:** Edit `server/src/modules/index.ts` to `import intent from './intent/routes.js'` and
  add `intent` to the `modules` registry object. Add an integration test
  `server/src/modules/intent/intent.it.test.ts` that seeds a workspace + repo + PR + `pr_files`,
  POSTs `/pulls/:id/intent/generate` (with a mocked/stubbed LLM provider via `ContainerOverrides`),
  asserts a 200 with `{ intent, in_scope, out_of_scope, pr_id }`, then GETs `/pulls/:id/intent`
  and asserts the persisted value matches; and asserts `GET` for a PR with no intent returns 404.
- **Why:** Satisfies R4 end-to-end and guarantees the module is actually mounted (registry is the
  only wiring point).
- **Module:** server
- **Type:** backend
- **Skills to use:** fastify-best-practices, drizzle-orm-patterns, onion-architecture-node
- **Owned paths:** `server/src/modules/index.ts`, `server/src/modules/intent/intent.it.test.ts`
- **Depends-on:** T-04
- **Risk:** medium
- **Known gotchas:** `*.it.test.ts` suffix = DB-backed (requires Docker Postgres). Inject the LLM
  via `ContainerOverrides` so the test needs no API key (mock adapter pattern). `index.ts` imports
  use the `.js` extension.
- **Acceptance:** `cd server && pnpm exec vitest run intent.it.test` passes (3 assertions: generate
  200, get matches, get-missing 404).

#### T-09: Change `review_intent` default model to OpenRouter flash (both vendor copies)

- **Action:** In `server/src/vendor/shared/contracts/platform.ts`, change the `review_intent`
  `FEATURE_MODELS` entry from `defaultProvider: 'openai'`, `defaultModel: 'gpt-4.1'` to
  `defaultProvider: 'openrouter'`, `defaultModel: 'google/gemini-2.0-flash-001'`. Apply the
  **identical** edit to `client/src/vendor/shared/contracts/platform.ts`.
- **Why:** Satisfies R6 — the intent extractor must default to a cheap flash-class model.
- **Module:** server (+ client copy)
- **Type:** backend
- **Skills to use:** zod, typescript-expert
- **Owned paths:** `server/src/vendor/shared/contracts/platform.ts`,
  `client/src/vendor/shared/contracts/platform.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** `src/vendor/shared/` is a manual copy on both sides — the two files must stay
  byte-identical for this entry. Confirm `'openrouter'` is a valid `Provider` enum value (it is —
  `onboarding` already uses it).
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` and `cd client && pnpm typecheck` both
  clean; `grep` for `gemini-2.0-flash-001` returns the entry in **both** files.

### Phase 2 — reviewer-core injection + run-executor wiring

#### T-06: Add `intent` to reviewer-core ReviewInput + prompt section + scope rule

- **Action:** In `reviewer-core/src/prompt.ts` add `intent?: { summary: string; inScope: string[];
  outOfScope: string[] }` to `PromptParts`. In `assemblePrompt`, when `parts.intent` is present and
  `summary` is non-empty, push a `## PR Intent` section **immediately after** the `## PR description`
  section, rendering the summary + `In scope:`/`Out of scope:` bullet lists wrapped via
  `wrapUntrusted('pr-intent', …)`. Append a scope **rule** to the trusted system prompt (after
  INJECTION_GUARD), built as a string array joined with `.join(' ')`: "When a PR Intent section is
  present, focus the review on changes within the stated scope; do not raise findings that are
  purely out-of-scope nitpicks. If you find a serious defect that is out of the stated scope,
  surface it as a single signal finding rather than many." Also add `pr_intent` to the
  `PromptAssembly` record (`parts.intent ? summary : null`). In `reviewer-core/src/review/run.ts`
  add the same optional `intent` field to `ReviewInput` and forward it into the `promptParts`
  passed to `assemblePrompt` (both the single-pass and map-reduce `assemblePrompt({...promptParts})`
  call sites use the shared `promptParts`, so set it once).
- **Why:** Satisfies R3 — intent reaches every review prompt with a scope rule, without weakening
  the injection guard.
- **Module:** reviewer-core
- **Type:** core
- **Skills to use:** typescript-expert
- **Owned paths:** `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** Build the new multi-line rule as a `['…','…'].join(' ')` array, NOT a single
  quoted literal — the Edit tool corrupts ASCII quotes to Unicode and breaks `tsc` (reviewer-core
  INSIGHTS). The scope rule is TRUSTED system text and must NOT go inside `INJECTION_GUARD`. The
  intent section content IS untrusted → `wrapUntrusted`. Check whether `PromptAssembly` (in
  `@devdigest/shared`) needs a `pr_intent` field; if the type lacks it, render the section but keep
  `assembly` shape unchanged (do not add a contract field in this task — note as a follow-up).
- **Acceptance:** `cd reviewer-core && npm run typecheck` clean. Add/extend a hermetic test in
  `reviewer-core/src/prompt.test.ts` (or the nearest existing prompt test) asserting: with `intent`
  set, the assembled user message contains `## PR Intent` after `## PR description`; without
  `intent`, no `## PR Intent` section appears. `cd reviewer-core && npm test` passes.

#### T-07: run-executor loads intent and threads it into every ReviewInput

- **Action:** In `server/src/modules/reviews/run-executor.ts`, before the per-agent loop (near the
  diff load around line 95-105), load the stored intent once:
  `const intent = await this.repo.getIntent(pull.id).catch(() => undefined);` wrapped in a
  `runLog.step('Loading PR intent', …)`. Map it to the reviewer-core shape
  `{ summary: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope }` when
  present. Pass it into the `reviewPullRequest({...})` call in `runOneAgent` using the existing
  omit-when-absent spread pattern: `...(intentBlock ? { intent: intentBlock } : {})`. If intent is
  absent, the section is simply omitted — the review proceeds normally.
- **Why:** Satisfies R7 — reviews actually consume the stored intent; absence never blocks a run.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, typescript-expert
- **Owned paths:** `server/src/modules/reviews/run-executor.ts`
- **Depends-on:** T-06
- **Risk:** medium
- **Known gotchas:** `getIntent` is already on `ReviewRepository` (`this.repo.getIntent`). Load it
  once before the agent loop (it is shared across agents, like the diff) and pass the same block to
  each `runOneAgent`/`reviewPullRequest`. Use the `...(x ? {…} : {})` spread so an absent intent
  omits the field (matches the `prDescription`/`callers` pattern already in this file).
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` clean; `cd server && pnpm exec vitest run
  --exclude '**/*.it.test.ts'` (existing run-executor unit tests) stays green.

### Phase 3 — Client UI

#### T-08: Intent hooks (`brief.ts`) + barrel export

- **Action:** Create `client/src/lib/hooks/brief.ts` ("use client") with:
  `useIntent(prId: string | null | undefined)` → `useQuery({ queryKey: ['intent', prId ?? ''],
  queryFn: () => api.get<PrIntentRecord>(\`/pulls/${prId!}/intent\`), enabled: !!prId, retry: false })`;
  `useRecalculateIntent()` → `useMutation({ mutationFn: (prId: string) =>
  api.post<PrIntentRecord>(\`/pulls/${prId}/intent/generate\`), onSuccess: (_d, prId) =>
  qc.invalidateQueries({ queryKey: ['intent', prId] }) })`. Re-export from
  `client/src/lib/hooks/index.ts` by adding `export * from "./brief";`.
- **Why:** Satisfies R5's data layer — query + recalc mutation for the Intent card.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-best-practices, react-frontend-architecture, next-best-practices
- **Owned paths:** `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`
- **Depends-on:** none (the endpoint exists after Phase 1, but the hook compiles against the shared
  `PrIntentRecord` type independently; run it after T-05 to test against a live API)
- **Risk:** low
- **Known gotchas:** Every PR-scoped query MUST include `enabled: !!prId` (client INSIGHTS — empty
  segment → 404 otherwise). Import `PrIntentRecord` from `@devdigest/shared`. `retry: false` so a
  404 (no intent yet) surfaces immediately as an empty state rather than spinning.
- **Acceptance:** `cd client && pnpm typecheck` clean; `import { useIntent, useRecalculateIntent }
  from "@/lib/hooks"` resolves.

#### T-10: Intent card in OverviewTab + i18n

- **Action:** Add an `IntentCard` to the Overview tab. Edit
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` to accept
  a new `prId: string` prop and render an intent section above/below the description:
  `SectionLabel` (with a "Recalculate" button in its `right` slot) + the intent summary +
  in_scope / out_of_scope chips. Use `useIntent(prId)` for data and `useRecalculateIntent()` for
  the button; the mutation MUST have `onError: () => toast.error(t("intent.recalcError"))`. Render
  an empty state ("No intent yet — Recalculate") when the query 404s/returns null, and a per-chip
  list for `in_scope`/`out_of_scope`. Update the parent at
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` line ~137 to pass `prId`:
  `<OverviewTab prBody={pr.body} prId={prId} />`. Add the i18n keys under a new `intent` group in
  `client/src/i18n/messages/en/prReview.json` (`intent.title`, `intent.inScope`, `intent.outOfScope`,
  `intent.recalculate`, `intent.recalcError`, `intent.empty`). Add a colocated styles entry in the
  existing `OverviewTab/styles.ts` for the chips.
- **Why:** Satisfies R5 — the visible Intent card with summary, scope chips, and Recalculate.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-best-practices, react-frontend-architecture, next-best-practices,
  react-testing-library
- **Owned paths:**
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/styles.ts`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx`,
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`,
  `client/src/i18n/messages/en/prReview.json`
- **Depends-on:** T-08
- **Risk:** medium
- **Known gotchas:** The recalc mutation MUST carry `onError: () => toast.error(...)` — the
  `ConventionsView` precedent silently reverted to an empty state without it (client INSIGHTS).
  Reuse `SectionLabel` + its `right` slot for the button (the `VerdictBanner`/`SectionLabel` card
  model already used in this area). Keep `OverviewTab` under ~200 lines — if the card grows, extract
  an `IntentCard` child component inside the same `_components/OverviewTab/` folder (still within the
  owned path).
- **Acceptance:** `cd client && pnpm typecheck` passes. A new RTL test in `OverviewTab.test.tsx`
  (MSW-mocked `/pulls/:id/intent` + `/generate`) covers: (1) loaded intent renders the summary and
  scope chips; (2) clicking "Recalculate" triggers the mutation and shows updated intent;
  (3) a 404 shows the empty state. `cd client && pnpm test` passes.

## Testing strategy
- Unit (server extractor): `cd server && pnpm exec vitest run intent/extractor`
- Integration (intent endpoints, Docker): `cd server && pnpm exec vitest run intent.it.test`
- Server typecheck / unit guard: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- reviewer-core: `cd reviewer-core && npm test && npm run typecheck`
- Client: `cd client && pnpm test && pnpm typecheck`
- No new migration (the `pr_intent` table and contracts already exist). If the server is run after
  pulling, no `pnpm db:migrate` is required for this feature.

## Risks & mitigations

- Missing or empty PR body — explicitly valid; inference runs from title + file names + hunk
  headers only. No mitigation needed beyond the `body: null` guard in `buildIntentInput`.
- Linked issue and plan/spec links are not persisted in DB — a missing GitHub token or a bad URL
  would otherwise break generation. Mitigation: T-03's `resolvePlanContent` wraps every fetch in
  try/catch and returns null on any failure; generation always proceeds.
- A flash-class model may return malformed JSON or empty content (reasoning models). Mitigation:
  T-02 uses `llm.complete()` + first-`{`/last-`}` slice + safe default, never `completeStructured`.
- `PromptAssembly` (shared contract) may not have a `pr_intent` field; adding one would be a
  cross-copy contract change out of scope here. Mitigation: T-06 renders the section without
  changing the `PromptAssembly` shape; a contract field for trace display is flagged as a follow-up.
- Scope rule could be mistaken for an injection-guard change. Mitigation: T-06 explicitly appends it
  as trusted system text, separate from INJECTION_GUARD, and wraps the intent *content* as
  untrusted.

## Red-flags check
- [x] Global Constraints have no internal contradictions
- [x] Every requirement maps to a task (R1→T-01/T-02, R2→T-03, R3→T-06, R4→T-04/T-05, R5→T-08/T-10,
      R6→T-09, R7→T-07)
- [x] Dependencies form a DAG (T-01→T-02→T-03→T-04→T-05; T-06→T-07; T-08→T-10; T-09 independent)
- [x] Concurrent tasks have non-overlapping Owned paths and parent directories (T-01/T-02 share
      `extractor.ts` and are therefore sequential, not concurrent; T-09 and Phase-2/3 tasks own
      disjoint dirs)
- [x] Every task names exact file paths
- [x] Every task is self-contained (carries contract ref, owned paths, acceptance)
- [x] Every Acceptance is a runnable command with binary pass/fail
- [x] Each phase is independently mergeable (P1 = working API; P2 = reviews consume intent; P3 = UI)
- [x] Shared contract change (T-09) updates both vendor copies in one task
- [x] No schema change → no `db:generate`/`db:migrate` needed (table pre-exists)
- [x] Integration edge-cases explicit: 404-on-missing-intent (T-05), best-effort linked-issue
      fetch (T-03), malformed-LLM-JSON safe default (T-02), recalc `onError` toast (T-10)
