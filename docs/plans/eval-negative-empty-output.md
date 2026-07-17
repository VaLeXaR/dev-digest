# Development Plan: Negative eval cases as empty `expected_output`

## Overview
Seed a negative eval case (from a DISMISSED finding) with an empty `expected_output` array (`[]`)
instead of a `must_not_flag` entry, so the scorer's existing empty-expected branch
(`reviewer-core/src/eval/score.ts:84-92`, "pass iff zero grounded findings") produces the correct
pass/fail verdict. The scorer already handles `[]`; the only server changes are the seed's
type/expected decision and the contradictory-case guard (which goes blind once negatives carry no
range). North star: after the change, re-running the owner's live eval set yields verdicts that
match each case's human accept/dismiss intent (the requester's "1 of 5 → 5 of 5" check).

## Execution mode
**Single-agent (sequential).** The entire change lives in `server/src/modules/eval/**` — one
service file (`service.ts`), one repository pair, one integration-test file, and an optional
one-off data script. The seed change, the guard rework, and the repo accessor are tightly coupled
and two of them touch the same file; there is effectively no parallelism to exploit and strict
Owned-path partitioning would only add coordination overhead. Recommended pending grilling
confirmation (see Recommendations R-E).

**GRILLING COMPLETE (2026-07-17) — single-agent sequential CONFIRMED.**

## Grilling resolutions
<!-- Requester decisions, 2026-07-17. Binding. Supersede the Recommendations below. -->
- **G-D (negative semantics, was R-D):** A negative case means "this change is CLEAN — flag
  NOTHING in the file-fragment", NOT "don't raise this one finding". So an empty-array negative
  passes iff the agent emits zero grounded findings in the fragment. Accepted deliberately;
  confirms the empty-array approach. The rare mis-verdict (agent flags a legit unrelated issue in
  the same file → negative fails) is an accepted consequence.
- **G-A (contradictory-case guard — REVISED, supersedes R-A entirely):** The guard keys on
  **same `source_finding_id` + opposite polarity**, NOT file/range overlap. Rationale surfaced in
  grilling: (1) both real contradictions in the live data were the SAME finding seeded twice after
  its decision was reversed (`15589119` → `ad769a0e`+`c34e6a01`; `c9f4fba1` → `379d857a`+`6c661003`)
  — the sharpest signal is finding identity, not location; (2) a range-precise guard is
  INCONSISTENT with G-D (under "silence on the whole file", a positive at ANY line contradicts an
  empty negative, so range overlap under-catches); (3) two cases on the same file PATH can be from
  DIFFERENT PRs (same path, different content) and are NOT contradictory — a file/range guard
  false-positives there, a finding-id guard does not. **Consequence:** the T-01 repo accessor is NO
  LONGER NEEDED — `casesBySourceFinding(workspaceId, findingId)` already exists
  (`repository/case.repo.ts`, used by `evalCaseSeed`), and polarity is `expected_output.some(e =>
  e.type === 'must_find')`. No `getFinding`, no `rangesOverlap`, no range math. The guard also
  narrows to same-finding only (a different finding on the same location is no longer caught) —
  accepted, since that has never occurred in the data.
- **G-B (existing legacy negative, was R-B):** Migrate `c34e6a01` (and any dismissed-seeded
  `must_not_flag` case) to `expected_output: []` via a one-off idempotent script. Uniform model.
- **G-C (precision trade-off, was R-C):** Accepted — correct pass/fail matters more than the
  precision metric; do NOT preserve `must_not_flag` to keep precision. The "agent wrongly flagged"
  signal now lives in the negative case's pass/fail.
- **G-E (execution mode, was R-E):** Single-agent sequential.

## Requirements
<!-- Restates only what the requester stated or confirmed. -->
- R1: A negative eval case seeded from a **dismissed** finding carries `expected_output: []` (empty
  array, no `must_not_flag` entry). Single choke point: `buildSeedFromFinding`
  (`server/src/modules/eval/service.ts:431-505`; type decision at `:437`, expected object at
  `:470-478`) — it feeds `evalCaseSeed`, `createCaseFromFinding`, and `evalRunPreviewFromFinding`,
  so fix it once.
- R2: An **accepted** finding still yields `expected_output: [{ type: 'must_find', file,
  start_line, end_line, severity, category, title }]`, unchanged from today.
- R3 (revised per G-A): The contradictory-case guard in `createCaseFromFinding`
  (`server/src/modules/eval/service.ts:545-573`) is reworked to key on **same `source_finding_id`
  + opposite polarity**: reject creating a case from finding X when a case already backs the same
  finding X with the opposite polarity (positive = `expected_output` has a `must_find` entry;
  negative = empty array or `must_not_flag`). Uses the EXISTING `casesBySourceFinding` — no new
  accessor, no range math. This replaces the just-committed file+range+opposite-type guard, which
  goes blind once negatives carry no range.
- R4: The scorer is NOT changed. `reviewer-core/**` stays entirely out of this plan's Owned paths.
- R5: No UI/editor change. `client/**` (including `client/src/components/eval/EvalCaseEditor/**`
  and both EvalsTabs) is untouched. Positive vs negative become visually distinct for free (`[]`
  vs finding JSON in the modal).
- R6: No contract change. `expected_output` is already `z.array(ExpectedFinding)`
  (`server/src/vendor/shared/contracts/knowledge.ts:112`), so `[]` is already valid; `must_find`
  and `must_not_flag` both stay in the `ExpectedFinding.type` enum (`:86-95`) and in the scorer.
  Neither `@devdigest/shared` vendor copy is edited.
- R7: The one surviving legacy negative case `c34e6a01-aad9-4f61-9566-94da2ac92c82` (Security
  Reviewer, `client/src/lib/hooks/project-context.ts`, currently `must_not_flag`, source finding
  dismissed) is handled per the migration decision (see Recommendations R-B). The scorer handles
  both shapes, so leaving it is functionally valid; migrating it makes the model uniform.
- R8: Success is measured empirically: re-run the affected owner's live eval set and confirm each
  case's verdict matches its human intent (the "1 of 5 → 5 of 5" check). Manual, real LLM spend,
  not a CI gate.

## Recommendations
<!-- Advice to confirm in grilling; not binding, not requirements until confirmed. -->
<!-- RESOLVED 2026-07-17 — see ## Grilling resolutions above. R-A was REPLACED (guard now keys on
     same source_finding_id + opposite polarity, dropping the T-01 accessor); R-B→migrate;
     R-C/R-D→accepted; R-E→single-agent. The R-A/R-B option prose below is kept for rationale. -->
- R-A (guard signal source, drives whether T-01 is needed): to detect a NEW positive case
  contradicting an EXISTING empty-array negative case, the guard needs the negative's file+range,
  which its `[]` no longer carries. **Recommended: derive it from the case's `source_finding_id`**
  (`server/src/db/schema/eval.ts:25`) → `container.reviewRepo.getFinding(sourceFindingId)`
  (`server/src/modules/reviews/repository.ts:125`) → `finding.file/startLine/endLine`. This
  preserves the guard's exact pre-existing "same file + overlapping range + opposite type"
  semantics and only rejects a positive that overlaps the *specific dismissed region*, not the
  whole file. Cost: `source_finding_id` is dropped by the `EvalCase` DTO (`toEvalCase`,
  `server/src/modules/eval/repository/case.repo.ts:15-31`), so a small repo accessor is needed
  (T-01), and a since-deleted source finding (no FK, schema comment `:23-24`) yields no range → that
  one pair is skipped (best-effort, acceptable for a create-time guard). **Alternative (Option B):**
  derive only the FILE from the negative's `input_files[0].path` (always present — `input_files` is
  `files.filter(f => f.path === finding.file)`, `service.ts:485-492`) and match at file level. No
  T-01, always available, but rejects ANY positive on that file even at an unrelated line — coarser
  than today's range-overlap guard. — needs requester confirmation.
- R-B (existing-case migration): **Recommended: migrate `c34e6a01` (and any other dismissed-seeded
  `must_not_flag` case) to `expected_output: []`** via a one-off, idempotent script mirroring
  `server/src/db/backfill-eval-fragments.ts` (run via a new `pnpm db:backfill-*` script), for a
  uniform negative model. Alternative: leave `must_not_flag` cases as a still-valid legacy shape
  (scorer handles both) — simpler, but undercuts "negatives are empty-array" uniformity and keeps a
  mixed model. Note: whichever is chosen, the backfill script's `logContradictoryPairs` diagnostic
  (`backfill-eval-fragments.ts:137-168`) also goes blind to empty-array negatives (same reason as
  the guard); the create-time guard rework (R3) is the live protection, the log diagnostic is not.
  — needs requester confirmation.
- R-C (precision trade-off, accepted design decision): with empty-array negatives there are no
  `must_not_flag` false-positive entries (`reviewer-core/src/eval/score.ts:67-78`), so a negative
  case contributes no FP and the dashboard `precision` metric loses its negative-case input
  (degenerates to ~1/null). The correctness signal moves into the negative case's own pass/fail.
  The requester prioritises correct pass/fail over the precision metric — record as a deliberate
  trade-off; do NOT preserve precision by keeping `must_not_flag`. — needs requester confirmation.
- R-D (stricter negative pass-rule, accepted design decision): empty-array = "flag NOTHING in this
  fragment", so the agent flagging any legitimate unrelated issue in the same single-file fragment
  fails the case (uncommon on a one-file fragment, but possible). This stricter rule is the point
  the "correct run" hinges on. — needs requester confirmation.
- R-E (execution mode): single-agent sequential, per the Execution mode section. — needs requester
  confirmation.

## Affected modules & contracts
- `server/src/modules/eval` — seed decision + same-finding contradictory-case guard, BOTH in
  `service.ts` (no repo accessor — `casesBySourceFinding` already exists, per grilling G-A).
  Integration tests in `service.it.test.ts`.
- `server/src/db/backfill-eval-negative-empty.ts`-style one-off script + `package.json` — legacy
  negative migration (grilling G-B).
- Contracts: **none.** `expected_output: []` is already valid `z.array(ExpectedFinding)`; both
  vendor copies untouched.
- `reviewer-core/**`: **untouched** (scorer already correct). Not in any Owned path.
- `client/**`: **untouched** (no UI work). Not in any Owned path.

## Architecture notes
- **Guard (revised per G-A) is pure Application orchestration in `service.ts`, no new DB access.**
  `createCaseFromFinding` already has `ctx.finding` (via `loadDecidedFinding`) → the new case's
  polarity is `!!ctx.finding.acceptedAt`. Call the EXISTING
  `this.repo.casesBySourceFinding(workspaceId, input.finding_id)` (`repository/case.repo.ts`,
  already used by `evalCaseSeed:518`) to get the cases already backing the same finding; reject if
  any has the opposite polarity (`c.expected_output.some(e => e.type === 'must_find') !==
  newIsPositive`). No new repo accessor, no `reviewRepo.getFinding`, no `rangesOverlap`, no range
  math — the whole file/range machinery the earlier draft needed is gone.
- The current guard's outer `for (const newExpectation of caseInput.expected_output)` loop
  (`service.ts:552`) does NOT run for an empty-array new negative, and its inner file+range+type
  comparison is the wrong model — replace the whole block, don't patch it.
- `evalCaseSeed`'s existing-match (`:519-520`, `.some(e => e.type === 'must_find') === wantPositive`)
  already resolves correctly for an empty array (`false === false` for a dismissed finding) — leave
  it working, don't change it.

## INSIGHTS summary
- [reviewer-core]: The scorer's empty-expected branch already gives the correct verdict —
  `expected.length === 0 ? kept.length === 0 : …` (`src/eval/score.ts:80-92`, 2026-07-15); do NOT
  touch `score.ts`.
- [reviewer-core]: `matchesExpectation` is file + line-overlap only; `severity/category/title` are
  decorative (`src/eval/score.ts:42-47`, 2026-07-17) — a green from-finding case is not proof the
  agent reproduced the finding, relevant when interpreting the R8 empirical re-run.
- [reviewer-core]: overlap-only matching and `must_not_flag`-as-precision are LITERAL requirements
  from the assignment (2026-07-17) — this plan deletes `must_not_flag` only from the SEED, keeping
  it in the contract and scorer, exactly as the two "do not fix the matcher / do not delete
  negatives from precision" insights demand for the scorer itself.
- [server]: The eval set could already hold two cases that make each other impossible with no
  rejection — the live `ad769a0e` (must_find) vs `c34e6a01` (must_not_flag) same-file collision
  (2026-07-17) — this is exactly what the reworked guard must keep catching under the new shape.
- [server]: `buildSeedFromFinding` already snapshots a diff FRAGMENT (single file), not the whole
  PR — the 2026-07-17 whole-PR insights predate the fragment work, which has landed
  (`service.ts:439-468`). The seed's file/range for the finding is `finding.file/startLine/endLine`.
- [server]: `agents.strategy` / null-fallback and MockLLMProvider `'openrouter'` seeding quirks
  (2026-07-15/-17) — relevant only if T-03's integration tests seed an agent; register the mock LLM
  under `llm: { openai: mock }` and seed the agent with `provider: 'openai'`.

## Phased tasks

> Each phase reaches a self-consistent, mergeable state. Single-agent mode: executed top-to-bottom.

### Phase 1 — Seed + guard (single file)

#### T-01: Empty-array negative seed + same-finding contradictory-case guard

- **Action:** In `server/src/modules/eval/service.ts`:
  (a) **Seed (`buildSeedFromFinding`, `:431-505`):** change the `type`/`expected` construction so a
  **dismissed** finding produces `expected_output: []` (no entry), while an **accepted** finding
  still produces `[{ type: 'must_find', file: finding.file, start_line: finding.startLine,
  end_line: finding.endLine, severity, category, title }]` unchanged. `input_diff`/`input_files`
  fragment, `input_meta`, and `owner` all stay as today. Note the `expected` object is only built
  on the accepted branch now — restructure so it isn't constructed for a dismissed finding.
  (b) **Guard (`createCaseFromFinding`, `:545-573`) — REPLACE the block (grilling G-A):** compute
  `const newIsPositive = !!ctx.finding.acceptedAt`; load the cases already backing the SAME finding
  via `const sameFinding = await this.repo.casesBySourceFinding(workspaceId, input.finding_id)`
  (already exists, used at `:518`); if any has the opposite polarity
  (`sameFinding.find(c => c.expected_output.some(e => e.type === 'must_find') !== newIsPositive)`),
  throw `new AppError('contradictory_case', <message naming the existing case id + its polarity>,
  409)`. Delete the old file+range+`rangesOverlap` nested-loop guard entirely — no range math, no
  `getFinding`, no new repo method.
- **Why:** Satisfies R1, R2, R3. (a) is the north star — it lets the scorer reach its correct
  empty-expected branch for negatives. (b) keeps the eval set from re-acquiring the exact
  same-finding-seeded-both-ways contradiction that produced the two live pairs, using the sharpest
  signal (finding identity), consistent with the "silence on the whole file" negative semantics
  (G-D) where a range-precise guard would under-catch.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, typescript-expert, zod
- **Owned paths:** `server/src/modules/eval/service.ts`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** `casesBySourceFinding` returns `EvalCase[]` with `expected_output` already
  parsed — polarity is `some(e => e.type === 'must_find')`; an empty array and a `must_not_flag`
  case both read as negative (`false`), so the check handles legacy shapes for free. The old guard's
  outer loop `for (const newExpectation of caseInput.expected_output)` (`:552`) does NOT run for an
  empty-array new negative — that's why it must be REPLACED, not patched. Leave `evalCaseSeed`'s
  `existing`-match (`:519-520`) untouched (`false === false` still resolves a dismissed finding's
  negative case correctly). Do NOT touch the scorer (`reviewer-core/**`) or the `ExpectedFinding`
  contract.
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/eval/service.it.test.ts` passes
  (green after T-02 adds cases); `cd server && pnpm exec tsc --noEmit` passes. (No `depcruise` —
  the script does not exist in this repo, server INSIGHTS 2026-07-02; layering is a same-file
  Application change, verify by reading imports.)

### Phase 2 — Tests

#### T-02: Integration tests for the empty-array seed and same-finding guard

- **Action:** In `server/src/modules/eval/service.it.test.ts` add cases (DB-backed, Docker):
  (1) a case created from a **dismissed** finding persists `expected_output: []`; a case from an
  **accepted** finding persists a single `must_find` entry with the finding's file/range.
  (2) creating a case from a finding whose set ALREADY has a case of the opposite polarity backing
  the **same** finding throws `AppError('contradictory_case')` (409) — both directions:
  existing-positive→new-negative and existing-negative→new-positive. Model the real scenario: seed
  a finding, create the first case, flip the finding's decision (`accepted_at`/`dismissed_at`),
  create the second → expect 409.
  (3) a DIFFERENT finding (different `source_finding_id`), even on the same file, does NOT throw —
  locks the narrowed same-finding scope so a future edit can't silently widen or re-blind it
  (server INSIGHTS 2026-07-02 "a single-group fixture can't distinguish correct from broken").
  (4) an empty-array negative case, scored via the normal run path, passes iff the agent emits zero
  grounded findings (the north-star behaviour end-to-end).
- **Why:** Satisfies R1, R2, R3 with binary, runnable evidence.
- **Module:** server
- **Type:** backend
- **Skills to use:** typescript-expert, zod
- **Owned paths:** `server/src/modules/eval/service.it.test.ts`
- **Depends-on:** T-01
- **Risk:** low
- **Known gotchas:** DB-backed → `.it.test.ts` (Docker). If a case seeds an agent + mock LLM,
  register the mock under `llm: { openai: mock }` and seed `provider: 'openai'` (server INSIGHTS
  2026-07-15 — `MockLLMProvider` rejects `'openrouter'`). Case (2) needs the finding's decision
  flipped between the two creates — use the repo/DB to set `dismissed_at`/`accepted_at`, since the
  new case's polarity is read from `ctx.finding` at create time.
- **Acceptance:** `cd server && pnpm exec vitest run src/modules/eval/service.it.test.ts` passes
  (all new cases green); `cd server && pnpm exec tsc --noEmit` passes.

### Phase 3 — Legacy-data migration

#### T-03: One-off migration of legacy `must_not_flag` negatives to `[]` (grilling G-B)

- **Action:** Add an idempotent one-off script mirroring
  `server/src/db/backfill-eval-fragments.ts` (new file under `server/src/db/`, e.g.
  `backfill-eval-negative-empty.ts`, plus a `pnpm db:backfill-eval-negative-empty` script in
  `server/package.json`) that, for each `eval_cases` row whose `expected_output` holds only
  `must_not_flag` entries (a dismissed-seeded negative in the legacy shape), rewrites
  `expected_output` to `[]`. Idempotent (already-empty rows unchanged); logs each conversion;
  leaves positive (`must_find`) and manual cases untouched. Confirm it converts
  `c34e6a01-aad9-4f61-9566-94da2ac92c82`.
- **Why:** Satisfies R7 (G-B) — a uniform empty-array negative model, removing the last legacy
  `must_not_flag` case so the whole set is one shape before the R8 empirical re-run.
- **Module:** server
- **Type:** backend
- **Skills to use:** drizzle-orm-patterns, typescript-expert
- **Owned paths:** `server/src/db/backfill-eval-negative-empty.ts` (NEW FILE),
  `server/package.json`
- **Depends-on:** T-01
- **Risk:** low
- **Known gotchas:** DATA update, not a schema migration — do NOT `pnpm db:generate` (no column
  change). Keying on the `expected_output` shape (`must_not_flag`-only) is sufficient and needs no
  finding lookup; a positive case never has a `must_not_flag`-only array, so it's safe. Read-only
  `SELECT` to verify before writing, and use `psql -c` NOT a heredoc for any manual check (server
  INSIGHTS 2026-07-17 — heredoc stdin silently no-ops through the Bash tool).
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` passes; running
  `pnpm db:backfill-eval-negative-empty` against the dev DB converts `c34e6a01` to
  `expected_output: []` and is a no-op on a second run (idempotent) — confirmed by a read-only
  `SELECT expected_output FROM eval_cases WHERE id = 'c34e6a01-…'` before/after.

## Testing strategy
- Unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` (no Docker) — for any pure
  helper touched.
- Integration (primary evidence here): `cd server && pnpm exec vitest run .it.test` (Docker) —
  `service.it.test.ts`.
- Typecheck: `cd server && pnpm exec tsc --noEmit`.
- Layering: no `depcruise` script exists in this repo (server INSIGHTS 2026-07-02); this plan's only
  code change is same-file Application logic in `service.ts` — verify layering by reading imports
  (no new `db/schema`/`drizzle-orm` import in `service.ts`).
- **Empirical north-star check (R8, manual, real LLM spend — NOT a CI gate):** with Postgres up,
  re-run the affected owner's live eval set (Security Reviewer, the 6 remaining live cases — the two
  stale-polarity cases were deleted 2026-07-17) and confirm each case's verdict now matches its
  human accept/dismiss intent (the "1 of 5 → all correct" result). Costs real deepseek-v4-flash
  spend (~cents per case). Read `cost_usd` from the API, not the rounded modal badge, to confirm
  calls actually ran (server INSIGHTS 2026-07-17). Do this AFTER T-03 so the whole set is one shape.

## Risks & mitigations
- Guard silently re-blinds itself (a same-finding opposite-polarity pair slips past) — mitigated by
  T-02 case (2) covering BOTH directions (existing-positive→new-negative and the reverse) with the
  finding's decision flipped between the two creates.
- The guard narrows to same-finding-only (G-A): two DIFFERENT findings on the same location decided
  oppositely are no longer rejected — accepted, that has never occurred in the data; the scorer
  still reports each such case's own pass/fail honestly, there's just no create-time block.
- A negative on a file that also has an unrelated real issue fails (G-D "silence on the whole
  file") — accepted consequence, uncommon on a single-file fragment.
- Empirical re-run non-determinism: the same agent/fixture can emit different findings run-to-run
  (server INSIGHTS 2026-07-17) — interpret a single green/red per case against human intent, and
  re-run a borderline case before concluding.

## Red-flags check
- [x] Execution mode is stated (single-agent) — CONFIRMED at grilling (G-E)
- [x] Every line in Requirements traces to the requester's brief — nothing originated here
- [x] Grilling resolutions (G-A..G-E) recorded and supersede the Recommendations
- [x] Global constraints have no internal contradictions (scorer/contract/UI untouched is
      consistent across Requirements + Architecture notes; guard model now consistent with the G-D
      whole-file negative semantics)
- [x] Every requirement maps to a task (R1/R2→T-01(a); R3→T-01(b); R4/R5/R6→enforced as non-goals,
      no task; R7→T-03; R8→Testing strategy empirical step; verified by T-02)
- [x] Dependencies form a DAG (T-01 → T-02; T-01 → T-03) — no cycles
- [x] Concurrent tasks have non-overlapping Owned paths (single-agent; T-01 service.ts vs T-02 test
      file vs T-03 db/ script are distinct)
- [x] No phase exceeds ~7 concurrent tasks
- [x] Seed + guard merged into one task (T-01) precisely because both own `service.ts`
- [x] Every cited path verified with Read/Grep — line numbers corrected from the brief's stale
      values (seed 431-505, guard 545-573); the T-01 repo-accessor task was DROPPED at grilling
      (`casesBySourceFinding` already exists)
- [x] Every task names exact file paths
- [x] Every task is self-contained (contract/paths/acceptance inline)
- [x] Every Acceptance is a runnable command with binary pass/fail
- [x] Each phase is independently mergeable (T-01 seed+guard works with the scorer as-is; T-02
      tests; T-03 data fix)
- [x] Shared contract changes: NONE — `expected_output: []` already valid; both vendor copies
      untouched (R6)
- [x] Schema changes: NONE — T-03 is a data update, no `db:generate`/`db:migrate`
- [x] Integration edge-cases explicit: the same-finding contradictory-case guard is part of T-01
      with dedicated T-02 coverage, not hidden inside the seed change
- [x] UI tasks: none (backend-only plan) — Design audit / Design references omitted intentionally
- [x] Design assets: none exist — sections omitted
- [x] Orphan contracts: no `@devdigest/shared` schema is added or changed by this plan
