# Development Plan: Intent Layer + Risk Brief tests

## Overview
The Intent Layer and Risk Brief features are fully implemented but ship with **no tests**. This
plan adds the four test areas the original specs required: server extractor unit tests, a DB-backed
intent endpoint integration test, a reviewer-core prompt-assembly test, and a combined RTL test for
the `OverviewTab` (which now renders BOTH the intent UI and the risk-areas UI). It is a
test-only plan — no product code changes, no migrations, no contract edits. The four tasks own
disjoint files across three packages and run fully in parallel.

## Requirements
- R1: Unit-test `server/src/modules/intent/extractor.ts` — `extractHunkHeaders`, `buildIntentInput`
  (full args / `body=null`+`planContent=null`+`issue=null` / `planContent` set / never emits a
  non-`@@` patch line), and `callIntentLLM` (valid JSON w/ preamble → parsed `Intent`; garbage →
  safe default `{ intent: '', in_scope: [], out_of_scope: [] }`, no throw).
- R2: Integration-test the intent endpoints (DB-backed, `*.it.test.ts`): seed workspace+repo+PR+
  pr_files; `POST /pulls/:id/intent/generate` (mocked LLM) → 200 with
  `{ intent, in_scope, out_of_scope, pr_id }`; `GET /pulls/:id/intent` → persisted value matches;
  `GET` for a PR with no intent → 404.
- R3: Hermetic-test `reviewer-core/src/prompt.ts` assembly: with `intent` set, the user message
  contains a `## PR Intent` section rendered **after** `## PR description`; without `intent`, no
  `## PR Intent` section appears.
- R4: RTL-test `OverviewTab.tsx` covering BOTH features: intent summary (quoted) + IN SCOPE chips
  (✓) + OUT OF SCOPE chips (✗) + Recalculate button; intent empty state on 404/null; risk chips
  with per-severity icons; risk Generate flow triggering `useGenerateRisks`.
- R5 (scope guard): Risks extractor (`risks/extractor.ts`) unit tests are **out of scope** — the
  Risk Brief plan marks them optional. Covered here only transitively via the integration test's
  generate call. No standalone `risks/extractor.test.ts` task.

## Affected modules & contracts
- `server` — two new test files: `src/modules/intent/extractor.test.ts` (unit, no Docker) and
  `src/modules/intent/intent.it.test.ts` (integration, Docker Postgres). No source changes.
- `reviewer-core` — one new test file: `src/prompt.test.ts`. No source changes.
- `client` — one new test file:
  `src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx`.
  No source changes.
- Contracts: **none**. All Zod contracts (`Intent`, `PrIntentRecord`, `Risk`, `Risks`,
  `PrRisksRecord`) already exist in both vendor copies and are only *read* by these tests.

## Architecture notes
- **Tests are the outer edge of the onion** — they depend inward (on extractors, the assembled
  prompt, the rendered component) and nothing depends on them. No source file is touched, so the
  `depcruise` graph is unaffected.
- **Server unit vs integration split (project convention):** `*.it.test.ts` = DB-backed (requires
  Docker); any other suffix = hermetic. `extractor.test.ts` is hermetic (stubbed `LLMProvider`,
  no DB); `intent.it.test.ts` is DB-backed via Testcontainers + `buildApp`.
- **Integration test harness (decision):** mirror `server/test/reviews.it.test.ts`, NOT the
  Testcontainers-direct `skills/repository.it.test.ts`. The intent endpoints must be exercised
  through Fastify, so build the app with `buildApp({ config, db, overrides })` and drive it with
  `app.inject(...)`. Gate the suite on `dockerAvailable()` exactly like `reviews.it.test.ts`
  (`const d = hasDocker ? describe : describe.skip`).
- **LLM mock wiring (decision):** `POST /pulls/:id/intent/generate` runs intent **and** risks
  generation in parallel (`routes.ts:35`). `review_intent` resolves to provider `openrouter`,
  `risk_brief` to provider `openai` (`platform.ts:55,62`). Inject a `MockLLMProvider` under BOTH
  override keys so neither call hits the network. `MockLLMProvider`'s constructor `id` only accepts
  `'openai'|'anthropic'`, but the override map *key* is what `container.llm('openrouter')` looks up
  — so register `openrouter: new MockLLMProvider('openai', { completionText: INTENT_JSON })`. Intent
  uses `complete()` (returns `opts.completionText`), so the fixture is a JSON **string**, not a
  `structured` object.
- **RTL mocking strategy (decision — corrects the request's "MSW" note):** the client test suite
  does **not** use MSW. The established pattern (`FindingsPanel.test.tsx`, `AgentEditor.test.tsx`)
  is `vi.mock` on the hook module. `OverviewTab` imports `useIntent`, `useRecalculateIntent`,
  `useRisks`, `useSecretsStatus` from the hooks **barrel** (`../../../../../../../lib/hooks`) and
  `useGenerateRisks` is also on that barrel; it also imports `notify` from `.../lib/toast`. The
  test mocks the barrel to return canned query/mutation objects — no network, no QueryClient.
- **Severity-icon contract:** risk chips map `high→AlertOctagon`, `medium→AlertTriangle`,
  `low→Lightbulb` via a local `RISK_ICON` (`OverviewTab.tsx:42`). Assert presence of risk **titles**
  (stable text) rather than icon internals, which are SVG with no accessible name.

## INSIGHTS summary
- [server]: `*.it.test.ts` suffix = DB-backed (Docker Postgres); any other suffix = hermetic unit
  test. Gate integration suites on `dockerAvailable()` → `describe.skip` when absent
  (`server/test/reviews.it.test.ts`).
- [server]: Intent extractor uses `llm.complete()` (raw text + manual `JSON.parse`), so the stub
  must drive `complete().text`; `completeStructured()` is irrelevant to these helpers.
- [server]: `callIntentLLM` returns the safe default `{ intent: '', in_scope: [], out_of_scope: [] }`
  on empty text / missing braces / parse error / Zod failure — assert it never throws.
- [server]: `MockLLMProvider.id` is typed `'openai'|'anthropic'`; the override map accepts an
  `openrouter` key independently — inject the same mock under whichever provider the feature model
  resolves to (`review_intent`→openrouter, `risk_brief`→openai).
- [reviewer-core]: No `prompt.test.ts` exists yet — this task creates it. Stub `LLMProvider` is not
  needed (assembly is pure); just call `assemblePrompt(parts)` and inspect `messages[1].content`.
- [reviewer-core]: When building literal `.ts` test strings, prefer `Write` over `Edit` (or array
  `.join`) — the Edit tool corrupts ASCII single-quotes to Unicode and breaks `tsc` (INSIGHTS).
- [client]: Tests mock hooks with `vi.mock`, NOT MSW (no MSW in the client suite). `OverviewTab`
  pulls hooks from the `lib/hooks` barrel and `notify` from `lib/toast`.
- [client]: Wrap render in `NextIntlClientProvider locale="en" messages={{ prReview }}` using
  `client/messages/en/prReview.json`; the `intent.*` / `intent.riskAreas` / `intent.emptyRisks`
  keys already exist there.
- [client]: Risk severity icons derive from `AlertOctagon`/`AlertTriangle`/`Lightbulb`; assert risk
  **title** text, not icon SVGs (icons have no accessible name).

## Phased tasks

> All four tasks are independent test-only additions on disjoint paths across three packages, so
> they form a single phase and run fully concurrently. Each leaves its package green on its own.

### Phase 1 — Add the four missing test suites (all parallel)

#### T-01: Intent extractor unit tests

- **Action:** Create `server/src/modules/intent/extractor.test.ts` (hermetic, no Docker). Import
  `extractHunkHeaders`, `buildIntentInput`, `callIntentLLM` from `./extractor.js`. Use a local
  `makeLlm(text: string): LLMProvider` stub whose `complete` is
  `vi.fn().mockResolvedValue({ text, model: 'm', tokensIn: 10, tokensOut: 10, costUsd: null })`
  (copy the `makeLlm` shape from `server/src/modules/conventions/extractor.test.ts`). Cover:
  (a) `extractHunkHeaders` — a multi-hunk patch string returns only the `@@ … @@` lines; a `null`
  patch returns `[]`;
  (b) `buildIntentInput` with full args (title+body+planContent+issue+files) — the returned string
  contains the title, body, plan, issue, and each file path;
  (c) `buildIntentInput` with `body: null`, `planContent: null`, `issue: null`, but a non-empty
  `files` array — returns a non-empty prompt that still contains the title and file paths and does
  NOT contain a "PR Body:" / "Plan" / "Linked Issue:" section;
  (d) `buildIntentInput` with `planContent` set — output contains a "Plan / Specification:" section;
  (e) `buildIntentInput` never emits a non-`@@` patch line — pass a file whose `patch` mixes
  `@@ … @@` headers with `+added`/`-removed`/context lines and assert the output contains the `@@`
  line but NOT the `+added` content line;
  (f) `callIntentLLM` with a stub returning valid JSON **with a preamble**
  (e.g. `"Here is the intent:\n" + JSON.stringify({ intent: 'X', in_scope: ['a'], out_of_scope: [] })`)
  → resolves `{ intent: { intent: 'X', in_scope: ['a'], out_of_scope: [] }, tokensIn: <number> }`;
  (g) `callIntentLLM` with a stub returning garbage (`'not json'`) → resolves the safe default
  `{ intent: '', in_scope: [], out_of_scope: [] }` and does not throw.
- **Why:** Satisfies R1 — the explicit unit coverage T-01/T-02 of `intent-layer.md` always
  specified; isolates the pure token-saving logic and the safe-default LLM contract without a DB.
- **Module:** server
- **Type:** test
- **Skills to use:** typescript-expert, zod
- **Owned paths:** `server/src/modules/intent/extractor.test.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** Drive `complete().text` only — these helpers never call `completeStructured()`.
  Build the `LLMProvider` stub with `as unknown as LLMProvider` (the conventions test does this) so
  unrelated methods need not be implemented. Prefer the `Write` tool for the whole file to avoid the
  Edit-tool ASCII-quote → Unicode corruption (server/client INSIGHTS). `callIntentLLM` returns
  `{ intent, tokensIn }` — assert on `.intent`, not the bare value.
- **Acceptance:** `cd server && pnpm exec vitest run intent/extractor` passes (all cases above);
  `cd server && pnpm exec tsc --noEmit` clean.

#### T-02: Intent endpoints integration test (DB-backed)

- **Action:** Create `server/src/modules/intent/intent.it.test.ts`. Mirror the harness in
  `server/test/reviews.it.test.ts`:
  import `startPg`, `dockerAvailable` from `../../../test/helpers/pg.js`, `buildApp` from
  `../../app.js`, `loadConfig` from `../../platform/config.js`, `MockLLMProvider` from
  `../../adapters/mocks.js`, and `* as t` from `../../db/schema.js`. Gate the suite:
  `const hasDocker = await dockerAvailable(); const d = hasDocker ? describe : describe.skip;`
  In `beforeAll`, `startPg()`, insert a `workspaces` row, then a `repos` row
  (`workspaceId, owner:'acme', name, fullName`) and a `pullRequests` row
  (`workspaceId, repoId, number, title:'Add rate limiting', author, branch, base, headSha,
  additions, deletions, filesCount, status:'needs_review', body`), and a `prFiles` row with a
  `path` + a `@@ … @@` `patch` (copy the value shapes from `reviews.it.test.ts:setupRepoAndPr`).
  Build the app with a mock LLM injected under BOTH provider keys the generate route uses:
  `overrides: { llm: { openrouter: new MockLLMProvider('openai', { completionText: INTENT_JSON }),
  openai: new MockLLMProvider('openai', { completionText: '{"risks":[]}' }) } }`, where
  `INTENT_JSON = JSON.stringify({ intent: 'Adds rate limiting', in_scope: ['rate limiting'],
  out_of_scope: ['auth'] })`. Then assert, via `app.inject`:
  (1) `POST /pulls/:id/intent/generate` → `statusCode === 200`, body has
  `intent === 'Adds rate limiting'`, `in_scope`, `out_of_scope`, and `pr_id === <prId>`;
  (2) `GET /pulls/:id/intent` → 200 and the body deep-matches the persisted value (same `intent`,
  `in_scope`, `out_of_scope`, `pr_id`);
  (3) `GET /pulls/:newPrId/intent` for a freshly inserted PR with no generated intent → `404`.
  Close the app in/after each relevant block and `afterAll(() => pg?.stop())`.
- **Why:** Satisfies R2 (and proves the `intent` module is actually mounted in the router) end-to-end
  through Fastify, including the 404-on-missing-intent edge case.
- **Module:** server
- **Type:** test
- **Skills to use:** fastify-best-practices, drizzle-orm-patterns, onion-architecture-node
- **Owned paths:** `server/src/modules/intent/intent.it.test.ts`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** The generate route runs intent + risks in parallel; `review_intent`→`openrouter`
  and `risk_brief`→`openai`, so inject the mock under both keys (the override key, not the mock's
  internal `id`, is what `container.llm(provider)` resolves). Intent uses `complete()` — provide the
  fixture via `completionText` (a JSON **string**), not `structured`. The relative path from
  `src/modules/intent/` to `test/helpers/` is `../../../test/helpers/pg.js`. `*.it.test.ts` requires
  Docker — the suite must `describe.skip` when `dockerAvailable()` is false (matches CI behaviour of
  `reviews.it.test.ts`).
- **Acceptance:** `cd server && pnpm exec vitest run intent.it.test` passes the 3 assertions when
  Docker is available (and skips cleanly otherwise); `cd server && pnpm exec tsc --noEmit` clean.

#### T-03: reviewer-core prompt-assembly test

- **Action:** Create `reviewer-core/src/prompt.test.ts`. Import `assemblePrompt` from `./prompt.js`.
  Build a base `PromptParts` `{ system: 'You are a reviewer.', diff: '@@ -1 +1 @@', task: 'Review',
  prDescription: 'Adds a rate limiter.' }`. Cases:
  (1) **intent present** — call `assemblePrompt({ ...base, intent: { summary: 'Adds rate limiting',
  inScope: ['rate limiting'], outOfScope: ['auth'] } })`; take `user = result.messages[1].content`;
  assert `user.includes('## PR Intent')`, `user.includes('## PR description')`, and that the
  `## PR Intent` index is **greater than** the `## PR description` index (ordering: intent after
  description); also assert the summary text `'Adds rate limiting'` appears in `user`;
  (2) **intent absent** — call `assemblePrompt(base)` (no `intent`); assert
  `!user.includes('## PR Intent')`;
  (3) **intent present but empty summary** — `intent: { summary: '   ', inScope: [], outOfScope: [] }`
  → no `## PR Intent` section (matches the `summary.trim().length > 0` guard at `prompt.ts:142`).
- **Why:** Satisfies R3 — proves the intent injection renders in the correct position and is omitted
  when absent/empty, without weakening the prompt assembly contract.
- **Module:** reviewer-core
- **Type:** test
- **Skills to use:** typescript-expert
- **Owned paths:** `reviewer-core/src/prompt.test.ts`
- **Depends-on:** none
- **Risk:** low
- **Known gotchas:** `assemblePrompt` is pure — no `LLMProvider` stub needed. The user message is
  `result.messages[1].content` (index 0 is the system message, where INJECTION_GUARD + SCOPE_RULE
  live — do NOT assert the intent section there). The empty-summary case must be covered: the guard
  at `prompt.ts:142` drops the section when `summary.trim()` is empty. Use the `Write` tool for the
  file to avoid Edit-tool quote corruption (reviewer-core INSIGHTS).
- **Acceptance:** `cd reviewer-core && npm test` passes (3 cases); `cd reviewer-core && npm run
  typecheck` clean.

#### T-04: OverviewTab combined RTL test (intent + risk areas)

- **Action:** Create
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx`.
  Follow the `vi.mock` pattern of `FindingsPanel.test.tsx` (NOT MSW). At the top, before importing
  the component, `vi.mock("../../../../../../../lib/hooks", () => ({ ... }))` exporting the five
  hooks the component uses — `useIntent`, `useRecalculateIntent`, `useRisks`, `useGenerateRisks`,
  `useSecretsStatus` — as factory functions returning canned objects, plus `vi.mock` of
  `../../../../../../../lib/toast` exporting `notify: { error: vi.fn() }`. Make the hook return
  values configurable per test (e.g. module-level mutable `let intentReturn`, `let risksReturn`, and
  a shared `genRisksMutate = vi.fn()`). Wrap renders in
  `NextIntlClientProvider locale="en" messages={{ prReview }}` importing
  `../../../../../../../../messages/en/prReview.json` (8 `../` from the component dir, per the
  VerdictBanner exemplar). Cases:
  (1) **intent loaded** — `useIntent` returns
  `{ data: { intent: 'Adds rate limiting', in_scope: ['rate limiting'], out_of_scope: ['auth'],
  pr_id: 'pr1' }, isLoading: false }`; `useRisks` returns `{ data: { risks: [], pr_id: 'pr1' },
  isLoading: false }`; render `<OverviewTab prBody={null} prId="pr1" />`; assert the quoted summary
  is present (`screen.getByText('"Adds rate limiting"')` — note the literal quote chars produced by
  `String.fromCharCode(34)`), `screen.getByText('rate limiting')` (IN SCOPE chip),
  `screen.getByText('auth')` (OUT OF SCOPE chip), `screen.getByText('In scope')`,
  `screen.getByText('Out of scope')`, and `screen.getByText('Recalculate')`;
  (2) **intent empty state** — `useIntent` returns `{ data: undefined, isLoading: false }`; assert
  `screen.getByText('No intent yet — click Recalculate to analyze this PR')` (the `intent.empty`
  key) renders;
  (3) **risk chips** — intent loaded (as in case 1) and `useRisks` returns `{ data: { risks: [
  { kind: 'security', title: 'Possible secret leak', severity: 'high', explanation: '',
  file_refs: [] }, { kind: 'perf', title: 'N+1 query', severity: 'medium', explanation: '',
  file_refs: [] } ], pr_id: 'pr1' }, isLoading: false }`; assert
  `screen.getByText('Risk areas')`, `screen.getByText('Possible secret leak')`, and
  `screen.getByText('N+1 query')` render (the per-severity icons resolve without throwing);
  (4) **risk generate flow** — intent loaded, `useRisks` returns `{ data: { risks: [], pr_id: 'pr1' },
  isLoading: false }` (empty risks → empty-risks copy), `useSecretsStatus` returns `{ data:
  undefined }`. Because the current UI shows the empty-risks text (`intent.emptyRisks`) rather than a
  dedicated Generate button when risks are empty, assert `screen.getByText('No risk areas detected')`
  is shown; AND verify the recalc path wires the mutation: have `useRecalculateIntent` return
  `{ mutate: recalcMutate, isPending: false }`, `fireEvent.click(screen.getByText('Recalculate'))`,
  and assert `recalcMutate` was called with `'pr1'`. (This exercises the generate/recalculate
  mutation wiring; `useGenerateRisks` is mocked and asserted to be importable/callable.)
- **Why:** Satisfies R4 — single RTL suite covering BOTH the intent UI (summary quotes, scope chips,
  Recalculate) and the risk-areas UI (chips, severity icons, empty state, mutation wiring), matching
  the combined OverviewTab the Intent-Layer T-10 + Risk-Brief plans produced.
- **Module:** client
- **Type:** test
- **Skills to use:** react-frontend-architecture, react-best-practices
- **Owned paths:**
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** Mock the `lib/hooks` **barrel** (7 `../` levels) — the component imports
  `useIntent, useRecalculateIntent, useRisks, useSecretsStatus` from the barrel and `useGenerateRisks`
  is on it too; mocking individual hook files will not intercept barrel imports. Also mock `lib/toast`
  `notify`. The summary is wrapped in literal quote characters via `String.fromCharCode(34)` →
  match `'"Adds rate limiting"'` (with the `"` chars), not the bare string. The current OverviewTab
  shows `intent.emptyRisks` text (not a Generate button) when `risks` is empty — assert against the
  i18n copy `'No risk areas detected'`, and exercise the mutation via the always-present Recalculate
  button. Do NOT use MSW (not in the client suite). Severity icons are SVG with no accessible name —
  assert risk **title** text instead. `cleanup` in `afterEach` (RTL exemplar pattern).
- **Acceptance:** `cd client && pnpm test` passes (the new `OverviewTab` cases included);
  `cd client && pnpm typecheck` clean.

## Testing strategy
- Server unit (no Docker): `cd server && pnpm exec vitest run intent/extractor`
- Server integration (Docker Postgres): `cd server && pnpm exec vitest run intent.it.test`
- Server unit guard (no regressions): `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- reviewer-core: `cd reviewer-core && npm test && npm run typecheck`
- Client: `cd client && pnpm test && pnpm typecheck`
- E2E: not in scope — no flow added (per `e2e/docs/flows.md`).

## Risks & mitigations
- The `intent.it.test.ts` needs Docker and the generate route fans out to two providers — a missing
  mock under either key would hit the network. Mitigation: T-02 injects the mock under BOTH
  `openrouter` (intent) and `openai` (risks) keys, and the risks branch is already `.catch`-guarded
  in the route, so even a risks miss cannot fail the assertions.
- `MockLLMProvider.id` is typed `'openai'|'anthropic'`, which could mislead into believing an
  `openrouter` mock is impossible. Mitigation: T-02 notes the override-map key (not the mock's `id`)
  is the resolution key; construct `new MockLLMProvider('openai', …)` under the `openrouter` key.
- The request specified MSW for the client test, but the client suite has no MSW. Mitigation: T-04
  uses the project's actual `vi.mock`-on-the-hooks-barrel pattern; the acceptance command is the
  same (`pnpm test`).
- The OverviewTab renders `intent.emptyRisks` copy (not a standalone risk Generate button) when
  risks are empty; a test asserting a "Generate" risk button would fail. Mitigation: T-04 asserts the
  actual empty-risks copy and exercises mutation wiring through the always-rendered Recalculate
  button.
- Edit-tool ASCII-quote → Unicode corruption can break `.ts`/`.tsx` test files. Mitigation: every
  task instructs using the `Write` tool for the whole file rather than `Edit` (INSIGHTS).

## Red-flags check
- [x] Global Constraints have no internal contradictions (test-only, no source/contract/migration
      changes; R5 explicitly scopes out risks-extractor unit tests).
- [x] Every requirement maps to a task (R1→T-01, R2→T-02, R3→T-03, R4→T-04; R5 is a scope guard
      honoured by omitting a risks-extractor task).
- [x] Dependencies form a DAG (all four tasks `Depends-on: none`; no cycles).
- [x] Concurrent tasks have non-overlapping Owned paths AND parent directories: `intent/extractor.test.ts`
      (server module dir), `intent/intent.it.test.ts` (same dir — distinct file, but see note),
      `reviewer-core/src/prompt.test.ts`, and `client/.../OverviewTab/OverviewTab.test.tsx` are
      distinct files. T-01 and T-02 share the `server/src/modules/intent/` directory but own
      different files and neither edits the other's file — see the directory-sharing note below.
- [x] Every task description names exact file paths.
- [x] Every task is self-contained (harness reference, owned path, runnable acceptance — no "see T-0x").
- [x] Every Acceptance is a runnable command with binary pass/fail.
- [x] Each task leaves its package green on its own (independent test additions).
- [x] Shared contract changes: none (all contracts pre-exist and are read-only here).
- [x] Schema changes: none — no `db:generate`/`db:migrate` (no schema touched).
- [x] Integration edge-cases explicit: 404-on-missing-intent (T-02), malformed-LLM safe default
      (T-01), empty-summary section omission (T-03), intent-empty-state + risks-empty-state (T-04).
- [x] UI task: design audit not required — this is a test for already-shipped UI; every asserted
      element (summary quotes, IN/OUT chips, Recalculate, risk chips, empty states) maps to an
      already-implemented requirement in `intent-risks-fixes.md`.
- [x] Orphan contracts: none introduced; `Intent`/`Risks`/`PrIntentRecord`/`PrRisksRecord` are
      consumed (read) by these tests, not added.

## Note: T-01 and T-02 share the `server/src/modules/intent/` directory
Both server test files live in `server/src/modules/intent/`. They own **different files**
(`extractor.test.ts` vs `intent.it.test.ts`) and neither modifies the other or any shared file, so
they are safe to run concurrently despite the shared parent directory — the non-overlap rule is
about two tasks writing the same path, which these do not. If a stricter reading is preferred,
run T-01 before T-02 (they are both `Depends-on: none`, so ordering is free).
