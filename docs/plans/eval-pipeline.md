# Development Plan: Eval Pipeline

## Overview
A regression harness for DevDigest reviewer agents: turn real review findings into reusable eval
cases, run an agent over all its cases in one click, and score **recall / precision /
citation_accuracy** in code (zero LLM) so a prompt edit's effect (old prompt vs new, "v6 → v7") is
measurable before promotion. The `eval_cases` / `eval_runs` data layer already exists but is fully
unwired; this feature adds the shared contracts, a new set-run batch table, a pure reviewer-core
scoring function, the server route/service/repository, and the client Evals tab, "Turn into eval
case" action, eval-case editor, compare-runs modal, and Eval Dashboard page.

## Execution mode
**Multi-agent (parallel implementers, strict Owned-path partitioning).** The requester's brief asks
for "precise Owned paths (non-overlapping so tasks can be dispatched in parallel where the DAG
allows)", so this plan partitions every task's Owned paths and marks intra-phase concurrency. The
change is large (28 ACs across server + reviewer-core + client + shared contracts) and naturally
splits along module boundaries, so parallelism pays off. The same DAG executes correctly in
single-agent mode too (top-to-bottom); `grilling` should confirm the mode with the requester before
dispatch.

## Requirements
<!-- Restates only the spec's confirmed acceptance criteria (AC-1..AC-28) + success criteria. -->
- R1 (AC-1/AC-2/AC-3): One-click "Turn into eval case" on a finding creates an eval case —
  `must_find` if the finding is **accepted**, `must_not_flag` if **dismissed** — snapshotting the
  finding's input (diff + files + PR meta) onto the case at creation time.
- R2 (AC-4): An agent's **Evals** tab lists every `eval_cases` row where `owner_kind='agent'` and
  `owner_id=<agentId>`, each showing last-run pass/fail or a distinct "never run" state.
- R3 (AC-5/AC-6/AC-11): "Run all evals" runs the agent over **every** case in its set as one run,
  using each case's **snapshotted** input (never re-fetching the live PR), recording recall /
  precision / citation_accuracy computed with **zero LLM calls**.
- R4 (AC-7/AC-8): Matching + recall — an agent finding is credited to an expectation only when its
  `file` equals the expectation's `file` AND its `[start_line,end_line]` overlaps the expectation's
  range; `recall` = matched `must_find` / total `must_find`.
- R5 (AC-9/AC-21): `precision` = TP/(TP+FP) over **covered** findings only (TP overlaps a
  `must_find`, FP overlaps a `must_not_flag`); findings overlapping neither expectation are
  **excluded** from the denominator.
- R6 (AC-10): `citation_accuracy` = `kept / (kept + dropped)` from `groundFindings` over the case's
  snapshotted diff, measured over the agent's **raw pre-grounding** findings.
- R7 (AC-12): On set-run completion, write **one `eval_run_batches` row** recording the agent
  version + aggregate metrics, and link each per-case `eval_runs` row to it via `batch_id`.
- R8 (AC-13/AC-14): Selecting exactly two runs of one agent enables a Compare view showing
  per-metric deltas + the system-prompt diff between the two versions; a system-prompt change
  between two runs over the same set yields differing recall and/or precision.
- R9 (AC-15): The Eval Dashboard shows the latest eval run per reviewer agent plus a per-agent
  drill-down of that agent's run history.
- R10 (AC-16): An eval case with empty expected output passes iff the agent emits zero findings on
  it (pure precision case).
- R11 (AC-17): The snapshotted diff is treated as untrusted data — the same `INJECTION_GUARD`
  wrapping as `reviewer-core/src/prompt.ts` applies when the agent runs over it.
- R12 (AC-18): If the agent call fails on one case mid-run, record that case as failed with the
  reason and continue the remaining cases (no whole-run abort).
- R13 (AC-19): While editing an eval case's expected output, the UI indicates whether the current
  text is valid JSON before allowing Save.
- R14 (AC-20): "Promote" from the Compare view sets that agent version as the active configuration.
- R15 (AC-22/AC-23): `expected_output` persists as an array of `ExpectedFinding` records carrying an
  explicit `type` (`must_find` | `must_not_flag`) + `file` / `start_line` / `end_line`; manual
  authoring lets the reviewer set each entry's type.
- R16 (AC-24): A case is `pass` iff every `must_find` is matched AND no `must_not_flag` is triggered;
  `citation_accuracy` does not affect the per-case pass verdict.
- R17 (AC-25): If a set run's cases contain zero `must_find` expectations in total, run `recall` is
  reported as `null` ("n/a"), rendered "—" (never `0`/`NaN`).
- R18 (AC-26): "Turn into eval case" on a finding that already backs a case creates a **new** case
  (not a no-op/update) and surfaces a non-blocking "already has an eval case" hint on that finding.
- R19 (AC-27): "Run all agents" on the dashboard runs `POST /agents/:id/eval-runs` **sequentially**
  over every **enabled** reviewer agent, under the existing 10/min rate limit.
- R20 (AC-28): "View full dashboard →" from the Evals tab navigates to the Eval Dashboard with no
  additional backend call.
- R21 (success criteria): scoring issues 0 LLM calls; a one-line prompt change produces ≥1pt change
  in precision or recall between two runs over the same set; 100% of runs record the agent version;
  creating a case from a finding is one click.

## Recommendations
<!-- Advice for grilling to confirm; NOT binding requirements. -->
<!-- GRILLING COMPLETE (2026-07-15): REC-1..REC-5 all CONFIRMED — see ## Grilling resolutions (C1, G1-G5). -->
<!-- REC-1→C1, REC-2→G1, REC-3→G2, REC-4→G4, REC-5→G5. The "needs confirmation" markers below are historical. -->

- **REC-1 — No reviewer-core change to `reviewPullRequest`; reuse its existing return shape for raw
  pre-grounding (AC-10).** The spec left "a lower-level reviewer-core entry or a `{raw,grounded}`
  return shape" to be scoped at planning time. Evidence: `reviewPullRequest`'s `ReviewOutcome`
  already returns both `review.findings` (grounded survivors) and `dropped[].finding` (the findings
  the gate rejected) (`reviewer-core/src/review/run.ts:205-216`). Their **union is exactly the raw
  pre-grounding set**, so no new accessor and no mutation of the live path is needed. The only
  reviewer-core addition is the new pure scoring function (T-03). (needs requester confirmation)
- **REC-2 — Compute recall/precision over the GROUNDED (kept) findings; citation_accuracy over the
  raw set.** The spec resolves the citation denominator (raw) and the precision denominator
  (covered only) but is silent on whether recall/precision match over raw vs grounded findings.
  Recommended default: recall/precision over `kept` (a hallucinated-location finding shouldn't
  satisfy a `must_find` nor count as an FP — grounding, surfaced by citation_accuracy, is the metric
  that catches those, matching the spec's stated trade-off). All derivable inside the pure function
  from `(rawFindings, diff)`. (needs requester confirmation)
- **REC-3 — Define `citation_accuracy` as `null` ("—") when the agent emits zero raw findings**
  (denominator 0). The spec doesn't specify. Mirrors the AC-25 recall "n/a" treatment. (needs
  requester confirmation)
- **REC-4 — Snapshot the **whole PR unified diff** (+ files + PR meta) into the case, not just the
  single changed file's fragment.** AC-3 says "diff fragment"; matching is by file+line, so the full
  PR diff is a safe superset that guarantees the finding's file is present. `design/05` shows a
  single-file diff, which is compatible (it's just the one changed file). (needs requester
  confirmation)
- **REC-5 — Add a nullable `source_finding_id` column to `eval_cases` (in the T-02 migration) so
  the AC-26 "already has an eval case" hint is derivable.** The `eval_cases` table has no
  provenance column today; without one, a client cannot know a finding already backs a case. This is
  a schema addition beyond the spec's stated `eval_run_batches` change. (needs requester
  confirmation)

## Grilling resolutions (2026-07-15 — CONFIRMED)
<!-- Interview outcomes. These are now BINDING and supersede the "needs confirmation" markers in ## Recommendations. -->
- **G1 (REC-2) — recall & precision score over GROUNDED (kept) findings; citation_accuracy over the
  RAW set.** A dropped (ungrounded) finding neither satisfies a `must_find` (recall) nor counts as a
  precision FP; `citation_accuracy` is the sole metric that penalises ungrounded output. The pure
  function grounds once via `groundFindings(raw, diff)` and scores recall/precision over `kept`.
- **G2 (REC-3) — `citation_accuracy = null` ("—") when the agent emits ZERO raw findings** (0/0).
  Null-citation cases are **excluded** from the run-level citation aggregate (mean over producing
  cases only), never counted as 0.
- **G3 — `precision = null` ("—") when TP+FP = 0** (no covered findings). Excluded from the run
  aggregate. The empty-expected pass/fail (AC-16) is decided by the **expectation rule** (any finding
  on an empty-expected case → FP → fail), NOT by the precision number. Uniform policy across all
  three metrics: **0/0 → null, exclude from aggregate**; pass is a boolean rule citation never touches.
- **G4 (REC-4) — snapshot the WHOLE PR unified diff** (all `pr_files` patches) + files + PR meta via
  `diffFromPrFiles(prId)` (pure-DB snapshot path, no live git). Findings on un-annotated files are
  excluded from precision by the covered-only rule, so a whole-PR snapshot is a safe superset.
- **G5 (REC-5) — add nullable `source_finding_id uuid` (NO FK) to `eval_cases`** in the T-02
  migration; populated only by create-from-finding, powers the AC-26 "already has an eval case" hint
  (`GET /findings/eval-cases?ids=…` selects distinct `source_finding_id`).
- **G6 — create-from-finding owner = the finding's own review agent**, derived **server-side** from
  `finding_id` alone. **DROP `agent_id` from `EvalCaseFromFindingInput`** (request is `{finding_id}`
  only — single source of truth). When `finding → review.agent_id` is **null** (nullable, no FK;
  summary/legacy reviews), the server returns a 4xx and the client **disables/hides** the button. No
  agent-picker in v1.
- **G7 — single-case runs** (per-case ▷ in the Evals tab, "Run case"/"Run on save" in the editor)
  write an `eval_runs` row with **`batch_id = NULL`** and create **NO** `eval_run_batches` row.
  History / dashboard / Compare / trend read **only** batches; the Evals-tab per-case state and the
  editor "Last run…" line read the case's **latest `eval_runs` row by `ran_at`** (batch or scratch);
  the tab's headline EVAL METRICS tiles come from the agent's **latest batch**, not scratch runs.
- **G8 — new cross-agent `EvalDashboardOverview` contract** (both vendor copies, added in T-01) for
  the landing page (`design/04`): `{ agents: Array<{ agent_id, agent_name, model, latest_batch:
  EvalRunBatchRecord | null, sparkline: number[] }>, recent_runs: Array<EvalRunBatchRecord & {
  agent_name: string }> }`. The existing single-owner `EvalDashboard` is kept for the per-agent
  detail page (`design/06`). Endpoints unchanged: `GET /eval/dashboard` → overview, `GET
  /agents/:id/eval/dashboard` → detail.
- **G9 — detail-page header controls (`design/06`):** agent-picker (client-side route switch between
  `/eval/:agentId`) and "Run eval" (reuse `useRunEvalSet` for the current agent) are IN scope, both
  cheap. The date-range picker ("30 days") is rendered but does **client-side filtering** over a
  fetched window — **NO backend date query param** in v1.
- **G10 — eval-case editor Diff/Files/PR-meta inputs are EDITABLE** (plain `<textarea>`/editable
  fields) for BOTH new and edit modes — required for manual authoring (AC-23) since there is no other
  way to supply `input_diff`. Diff is the primary editable field; Files/PR-meta are optional JSON
  textareas (most cases leave them empty, matching `design/05`). Create-from-finding is the
  ergonomic happy path; manual authoring is the functional power-user escape hatch.
- **C1 (REC-1) — no `reviewPullRequest` mutation.** Raw pre-grounding set reconstructed as
  `outcome.review.findings ∪ outcome.dropped.map(d => d.finding)` from the existing `ReviewOutcome`
  (`run.ts:205-216`); the only reviewer-core addition is the pure `scoreEvalCase` (T-03).
- **C2 — rate limit:** the eval-runs route carries its **own** per-route `{ max: 10, timeWindow: '1
  minute' }` (mirroring `reviews/routes.ts` — per-route, not shared). "Run all agents" fans out
  **sequentially client-side** (`for…of` + `await`, never `Promise.all`).
- **C3 — metric-delta format (mockups disagree):** standardise on **signed integer
  percentage-points with a ▲/▼ arrow** ("▲ 4pt" / "▼ 2pt") across the Evals tab, detail page, and
  Compare modal (resolves the `design/03`/`02` "▲4pt" vs `design/06` "↑0.04" divergence in favour of
  pt-with-arrow). Cost delta = signed dollar ("▲ $0.02"). Always arrow + sign + color, never color
  alone (a11y).
- **C4 — execution mode:** multi-agent parallel implementers on the stated DAG, strict
  non-overlapping Owned paths (single-agent top-to-bottom is an equivalent fallback).

## Design references
<!-- Assets already persisted in the approved spec's own design/ folder; cited by reference, not duplicated. -->
| File | Shows |
| --- | --- |
| `specs/SPEC-2026-07-15-eval-pipeline/design/01-finding-card-turn-into-eval-case.png` | FindingCard action row with a new "Turn into eval case" button beside Accept / Dismiss / Learn / Reply to author |
| `specs/SPEC-2026-07-15-eval-pipeline/design/02-compare-runs-modal.png` | "Compare runs · v6 → v7" modal: metric-delta tiles + SYSTEM PROMPT DIFF + Close / Promote v7 |
| `specs/SPEC-2026-07-15-eval-pipeline/design/03-agent-editor-evals-tab.png` | AgentEditor **Evals** tab: EVAL METRICS row, "View full dashboard →", Eval-cases list, Run all evals / + New eval case |
| `specs/SPEC-2026-07-15-eval-pipeline/design/04-eval-dashboard.png` | Eval Dashboard sidebar page: header + "Run all agents", per-agent list, "RECENT EVAL RUNS · ALL AGENTS" table |
| `specs/SPEC-2026-07-15-eval-pipeline/design/05-eval-case-editor.png` | New/edit eval-case modal: Name + Diff/Files/PR-meta input tabs + Expected-output JSON editor + Run-on-save + Cancel/Run case/Save |
| `specs/SPEC-2026-07-15-eval-pipeline/design/06-eval-dashboard-agent-detail.png` | Per-agent drill-down: warning banner, three metric tiles + sparklines, METRIC TREND chart, RECENT RUNS table with checkboxes → Compare |

## Design audit
<!-- Style-level enumeration; every visible element maps to a requirement or an accepted, documented divergence. -->
| Panel | Element | Design file | Requirement |
| ----- | ------- | ------------ | ----------- |
| FindingCard actions | "Turn into eval case" button (flask/`FlaskConical`-style icon + label), rendered inline after Accept/Dismiss/Learn, ghost/secondary style matching siblings | `design/01` | R1 |
| FindingCard actions | Accept/Dismiss/Learn/Reply buttons already present as siblings (Learn/Reply not yet in current code — out of scope, only Accept/Dismiss exist) | `design/01` | context only |
| Evals tab | 4-tab row Config/Skills/Context/**Evals** (active tab underline) | `design/03` | R2; **DIVERGENCE (spec-accepted):** Stats/CI tabs in the mockup are out of scope — 4-tab row, not 6 |
| Evals tab | EVAL METRICS row: 4 tiles Recall / Precision / Citation accuracy / Traces passed, each with value + signed ▲/▼ delta + color (a11y: arrow+sign, not color alone) | `design/03` | R9; non-functional a11y |
| Evals tab | "View full dashboard →" link, right-aligned in the metrics header | `design/03` | R20 |
| Evals tab | "Eval cases" header + "N/M passing" pill; per-case rows: status icon (green check pass / red-x fail / hollow "never run"), case name (mono), "expected N finding(s), got M" subtitle, severity·category badge, run/edit/delete icon buttons | `design/03` | R2, R10; "never run" distinct state |
| Evals tab | "Run all evals" (ghost, play icon) + "+ New eval case" (primary) buttons, right-aligned | `design/03` | R3, R15 |
| Case editor | Modal title "Eval case · <name>", subtitle "<Agent> · simulate a PR and assert the expected output" | `design/05` | R15 |
| Case editor | Left column: Name field (required *), Input sub-tabs **Diff / Files / PR meta** (Diff active, shows monospace unified diff with added-line highlight) | `design/05` | R1, R15 |
| Case editor | Right column: "Expected output" header + "valid JSON" badge (green when valid) + "+ Finding skeleton" button; monospace JSON editor showing a findings array | `design/05` | R13, R15 |
| Case editor | **Per-entry `must_find` / `must_not_flag` control** — **DIVERGENCE (spec-accepted):** `design/05` JSON omits the `type` field; the manual editor must add an explicit per-entry type control (toggle/badge) so hand-authored cases set the expectation type | `design/05` | R15 (AC-23) |
| Case editor | Footer: "Run on save" toggle (left), Cancel / "Run case" (play icon) / Save (primary) buttons (right); result line "Last run passed · expected N finding, got M · Xs · $Y" | `design/05` | R3, R16 |
| Dashboard | Page header "Eval Dashboard" + subtitle + "Run all agents" primary button (play icon), right-aligned | `design/04` | R9, R19 |
| Dashboard | AGENTS list: per-agent row = agent icon + name + model badge + "Last run vN · <date> · X/Y pass" + sparkline + Recall/Prec/Cite value columns + chevron → drill-down | `design/04` | R9 |
| Dashboard | "RECENT EVAL RUNS · ALL AGENTS" table: agent name, timestamp, version link (vN), three bar+% cells (recall/precision/citation), pass X/Y | `design/04` | R9 |
| Agent detail | Breadcrumb "Skills Lab › Eval Dashboard › <Agent>", "‹ All agents" back link, agent name + model badge, subtitle "Regression harness · N runs on the K-trace gold set", agent-picker + date-range + "Run eval" controls | `design/06` | R9 |
| Agent detail | Warning banner "Precision dipped Npts on vX …" (amber, warning icon) | `design/06` | R9 (dashboard `alert` field) |
| Agent detail | Three metric tiles (Recall/Precision/Citation) each with big %, signed delta, and a sparkline | `design/06` | R9 |
| Agent detail | METRIC TREND multi-line chart (Recall/Precision/Citation legend) | `design/06` | R9 |
| Agent detail | RECENT RUNS table with a checkbox per row (select exactly two), "N selected" + Compare button (enabled at 2) | `design/06` | R8 |
| Compare modal | Title "Compare runs · v6 → v7", subtitle "Old prompt vs new — metric deltas and prompt diff…" | `design/02` | R8 |
| Compare modal | 4 delta tiles Recall / Precision / Citation / Cost, each "old → new" + signed ▲/▼ delta + color | `design/02` | R8; a11y arrow+sign |
| Compare modal | "SYSTEM PROMPT DIFF" section with v-old/v-new legend swatches + monospace diff (added line highlighted green) | `design/02` | R8 |
| Compare modal | Footer: Close (ghost) + "Promote v7" (primary, branch icon) | `design/02` | R14 |
| Sidebar nav | Single **Eval Dashboard** item (Gauge icon) in SKILLS LAB group after Conventions | `design/02`,`design/04` | R9; **DIVERGENCE (spec-accepted):** the mockup's GLOBAL group (Memory/Multi-Agent/Agent Performance/CI Runs) is out of scope — single nav item, no GLOBAL group |

## Affected modules & contracts
- `@devdigest/shared` (both vendor copies) — new `ExpectedFinding`; `EvalCase.expected_output` /
  `EvalCaseInput.expected_output` retyped from `z.unknown()` to `z.array(ExpectedFinding)`; new
  `EvalRunBatchRecord`, `EvalCaseFromFindingInput`, `EvalRunBatchResult`; AC-25 nullability
  reconciliation on the dashboard aggregate.
- `server/src/db/schema/eval.ts` + a new generated migration — new `eval_run_batches` table,
  `eval_runs.batch_id` FK column, and (REC-5) `eval_cases.source_finding_id` nullable column.
- `reviewer-core/src/eval/` — new pure scoring function (`score.ts`) exported from `index.ts`.
- `server/src/modules/eval/` — new feature module (routes / service / repository) wiring the eval
  data layer; registered in `server/src/modules/index.ts`.
- `server/src/modules/agents/` — new "promote version" repo method + service method + route (AC-20).
- `client/src/lib/hooks/eval.ts` — new TanStack Query hooks.
- `client/src/app/agents/[id]/` — Evals tab + eval-case editor modal; `AgentEditor` host wiring.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/` + `FindingsPanel/` —
  "Turn into eval case" action.
- `client/src/app/eval/` — new Eval Dashboard page + per-agent detail + compare modal;
  `client/src/vendor/ui/nav.ts` nav item.
- Contracts: added to `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` and their client
  mirrors (same task).

## Architecture notes
- **Onion placement (per `onion-architecture-node`):** the pure scoring function is **Core**
  (`reviewer-core/`, no I/O, only injected data). The run orchestration is **Application**
  (`modules/eval/service.ts`); it calls `container.llm(provider)`, `reviewPullRequest`, and the
  scoring function, and delegates persistence to the repository. DB access is **Infrastructure**
  (`modules/eval/repository.ts` — the only eval file allowed to touch `db/schema` + `drizzle-orm`,
  class-wrapper pattern over function-level `*.repo.ts` like `reviews/`). HTTP wiring is **Transport**
  (`modules/eval/routes.ts` — Zod-first, no logic). Cross-module reads (agent config, PR diff/files)
  go through `container.agentsRepo` / `container.reviewRepo`, never a direct import of another
  module's internals.
- **Eval run path (T-05) mirrors `run-executor.ts:runOneAgent`, NOT the fire-and-forget
  `runReview`.** The eval run must be synchronous (the route awaits scoring) and must persist to
  `eval_runs` / `eval_run_batches`, **not** `agent_runs` / `reviews` / `findings`. Precedent for
  running an agent over a raw diff **text**: `server/src/modules/review-diff/service.ts:36` parses
  `input.rawDiff` via `parseUnifiedDiff` then calls `reviewPullRequest`. The eval service parses
  `case.input_diff` (text) → `UnifiedDiff` **once** with
  `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts:14`, re-exported from
  `adapters/index.ts:9`) and passes that same `UnifiedDiff` to both `reviewPullRequest` and the
  scoring function.
- **AC-17 INJECTION_GUARD is inherited automatically** because the eval run routes through
  `reviewPullRequest → assemblePrompt`, which wraps the diff via `wrapUntrusted('diff', …)`
  (`reviewer-core/src/prompt.ts:167`) and appends `INJECTION_GUARD` (`prompt.ts:16,114-117`). A
  bespoke run path that bypassed `assemblePrompt` would lose the guard — the task must not do that.
- **AC-10 raw pre-grounding (REC-1):** the service reconstructs the raw finding set as
  `outcome.review.findings` ∪ `outcome.dropped.map(d => d.finding)` and passes it to the scoring
  function; the function calls `groundFindings(raw, diff)` itself to compute `kept/(kept+dropped)`.
  Confirmed available from the existing `ReviewOutcome` shape (`run.ts:100-118,205-216`) — no
  reviewer-core mutation.
- **Model resolution:** the eval run uses `agent.model` + `agent.provider` directly (exactly like
  `run-executor.ts:192-196`), NOT `resolveFeatureModel` — no new `FeatureModelId` is needed.
- **AC-20 promote is net-new (GAP):** no promote/restore/activate method or route exists in the
  agents module today (versions only bump forward as a side-effect of `update()`). Implement by
  reading the target `agent_versions.configJson` and applying it as an `update()` (which snapshots a
  fresh version) — see T-06.
- **Compare view (T-13) is assembled client-side** from two `EvalRunBatchRecord`s + the two agent
  versions' system prompts read via the existing `GET /agents/:id/versions/:version`
  (`agents/routes.ts:129-143`, `configJson.system_prompt`). No new server "compare" endpoint.
- **Set-run entity:** `eval_run_batches` (one row per set-run: agent_id, agent_version, ran_at,
  aggregate recall/precision/citation, pass_count/total_count, cost_usd) + `eval_runs.batch_id`
  FK. History + dashboard + compare read from batches; per-case `eval_runs` remain for drill-down.

## INSIGHTS summary
- [server]: Migrations do NOT run on boot and must never be hand-edited — `pnpm db:generate` then
  `pnpm db:migrate` after every schema change (`server/CLAUDE.md`; INSIGHTS 2026-06-20).
- [server]: `ReviewRepository` is a class-wrapper whose method signatures must be updated separately
  from the underlying function-level `*.repo.ts` — follow the same pattern for `EvalRepository`.
- [server/reviewer-core]: the Edit tool converts ASCII `'` to curly quotes in string literals
  (TS1127) — build multi-line strings / prompts with array `.join(' ')`, as `prompt.ts` does.
- [server]: adding a shared contract means editing BOTH vendor copies in the same change (contract
  sync rule) — client copy is a manual copy, not a symlink.
- [client]: `@testing-library/user-event` is NOT installed — use `fireEvent` in RTL tests.
- [client]: never `pnpm test -- <filter>` (forwards a literal `--`, hangs) — use
  `pnpm exec vitest run <path-or-glob>`.
- [client]: `Modal` (`vendor/ui/kit/Modal.tsx`) is a plain `position:fixed` overlay, not a portal —
  use it directly. Native `<select>` is unstyleable in dark mode — use `vendor/ui/kit/Select.tsx`.
- [client]: a nav-item `href` and its Next.js route path must match exactly, or the sidebar link
  404s (project-context `context` vs `/context` lesson, 2026-07-09) — keep nav href `/eval` in sync
  with the `client/src/app/eval/` route.
- [client]: RTL tests that mount `@uiw/react-codemirror` must mock it (jsdom lacks layout APIs) —
  applies only if the expected-output editor uses CodeMirror (a plain `<textarea>` needs no mock).

## Phased tasks

> Each phase reaches a self-consistent, mergeable state. Multi-agent: tasks within a phase with
> non-overlapping Owned paths run concurrently. No phase exceeds ~5 concurrent tasks.

### Phase 1 — Contracts & schema (foundation, parallel)

#### T-01: Shared eval contracts (both vendor copies)

- **Action:** In `server/src/vendor/shared/contracts/knowledge.ts` add an `ExpectedFinding` Zod
  object — `type: z.enum(['must_find','must_not_flag'])` (required), `file: z.string()`,
  `start_line: z.number().int()`, `end_line: z.number().int()` (all required), plus optional
  display-only `severity`/`category`/`title` — and retype `EvalCase.expected_output` (currently
  `z.unknown()`, line 81) to `z.array(ExpectedFinding)`. In
  `server/src/vendor/shared/contracts/eval-ci.ts`: retype `EvalCaseInput.expected_output` (line 27)
  to `z.array(ExpectedFinding)`; add `EvalRunBatchRecord` (`id`, `agent_id`, `agent_version:int`,
  `ran_at`, `recall: z.number().nullable()`, `precision: z.number().nullable()`,
  `citation_accuracy: z.number().nullable()`, `pass_count:int`, `total_count:int`,
  `cost_usd: z.number().nullable()`); add `EvalCaseFromFindingInput` (`finding_id`, `agent_id`); add
  `EvalRunBatchResult` = the batch record returned by `POST /agents/:id/eval-runs`; **`EvalCaseFromFindingInput`
  is `{ finding_id }` ONLY — do NOT include `agent_id`** (G6: owner derived server-side from the
  finding's review); add the new cross-agent **`EvalDashboardOverview`** shape (G8): `{ agents:
  Array<{ agent_id, agent_name, model, latest_batch: EvalRunBatchRecord | null, sparkline:
  z.array(z.number()) }>, recent_runs: Array<EvalRunBatchRecord & { agent_name: string }> }` (keep
  the existing single-owner `EvalDashboard` for the detail page); relax the AC-25
  nullability on the dashboard aggregate (`EvalDashboard.current.recall` / `delta.recall` →
  nullable, so "n/a" is representable) and make `EvalRunBatchRecord.precision` / `citation_accuracy`
  **nullable** too (G2/G3: null when 0/0). Apply **every** change identically to the client mirrors
  `client/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/eval-ci.ts`.
- **Why:** Satisfies R15/R17 and defines the shapes every downstream server/client task builds on;
  contracts-first so dependents typecheck. Without it `expected_output` stays `z.unknown()` and the
  batch/response shapes don't exist.
- **Module:** server + client (shared)
- **Type:** core (contracts)
- **Skills to use:** zod, typescript-expert
- **Owned paths:** `server/src/vendor/shared/contracts/knowledge.ts`,
  `server/src/vendor/shared/contracts/eval-ci.ts`,
  `client/src/vendor/shared/contracts/knowledge.ts`,
  `client/src/vendor/shared/contracts/eval-ci.ts`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** Both vendor copies must be edited in this same task (manual-copy sync rule).
  Build multi-line/enum literals carefully — the Edit tool corrupts ASCII quotes to curly quotes
  (TS1127); if it happens, restructure or run the documented byte-level fix. `eval-ci.ts` already
  imports `EvalOwnerKind` from `knowledge.js`, so import `ExpectedFinding` from `knowledge.js` too
  (never make `knowledge.ts` import `eval-ci.ts` — that would be a cycle).
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` and `cd client && pnpm typecheck` both pass;
  `z.array(ExpectedFinding)` is the type of `EvalCase.expected_output` and `EvalCaseInput.expected_output`
  in both packages; `EvalRunBatchRecord`, `EvalCaseFromFindingInput`, `EvalRunBatchResult` are
  exported from both `eval-ci.ts` copies.

#### T-02: Schema + migration — `eval_run_batches`, `eval_runs.batch_id`, `eval_cases.source_finding_id`

- **Action:** In `server/src/db/schema/eval.ts` add a new `evalRunBatches` `pgTable('eval_run_batches',…)`
  with columns: `id uuid pk defaultRandom`, `agentId uuid notNull → agents.id (cascade)`,
  `agentVersion integer notNull`, `ranAt timestamptz defaultNow notNull`,
  `recall/precision/citationAccuracy doublePrecision` (nullable), `passCount/totalCount integer`,
  `costUsd doublePrecision`. Add `batchId uuid` (nullable, `references(() => evalRunBatches.id, {onDelete:'cascade'})`)
  to the existing `evalRuns` table. Add `sourceFindingId uuid` (nullable, no FK constraint needed —
  findings can be deleted independently) to `evalCases` (REC-5, for the AC-26 hint). Then run
  `cd server && pnpm db:generate` and `pnpm db:migrate`; commit the generated migration file
  (next number after `0016_shocking_havok.sql`).
- **Why:** Satisfies R7 (persisted set-run) and R18 (provenance for the "already has an eval case"
  hint). The design's run-history table is one row per set-run with an agent version, which the
  per-case `eval_runs` table cannot represent.
- **Module:** server
- **Type:** backend (schema)
- **Skills to use:** drizzle-orm-patterns, postgresql-table-design
- **Owned paths:** `server/src/db/schema/eval.ts`, `server/src/db/migrations/**` (the newly
  generated `.sql` + updated journal only)
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** Migrations do NOT run on boot — `pnpm db:migrate` is mandatory after
  `db:generate`. NEVER hand-write or edit an existing migration; only the newly generated file is
  yours. Import `agents` from `./agents` in `eval.ts` for the FK (mind cross-file schema imports).
- **Acceptance:** `pnpm db:generate` produces exactly one new migration and `pnpm db:migrate`
  applies it cleanly against a running Postgres; `\d eval_run_batches`, `\d eval_runs` (has
  `batch_id`), and `\d eval_cases` (has `source_finding_id`) reflect the new shape;
  `cd server && pnpm exec tsc --noEmit` passes.

### Phase 2 — Core scoring, data layer, promote (parallel)

#### T-03: Pure eval scoring function in reviewer-core

- **Action:** Create `reviewer-core/src/eval/score.ts` exporting a pure
  `scoreEvalCase(expected: ExpectedFinding[], rawFindings: Finding[], diff: UnifiedDiff):
  { recall: number | null; precision: number | null; citation_accuracy: number | null; pass: boolean }`
  (all three metrics nullable per G1/G2/G3 — precision is `null` when TP+FP=0, NOT `1`).
  Reuse the overlap primitive semantics from `grounding.ts` (`rangeIntersects`): a finding is
  credited to an expectation when `finding.file === expectation.file` AND `[start_line,end_line]`
  ranges overlap (R4). Call `groundFindings(rawFindings, diff)` to get `kept`/`dropped`;
  `citation_accuracy = kept.length / (kept.length + dropped.length)`, `null` when `rawFindings` is
  empty (REC-3). Compute `recall`/`precision` over the **kept** findings (REC-2): `recall` = matched
  `must_find` / total `must_find`, `null` when there are zero `must_find` (R17); `precision` =
  TP/(TP+FP) over covered findings only, findings overlapping neither expectation excluded (R5);
  when TP+FP = 0, precision is **`null`** (G3 — NOT `1`), and null-precision cases are excluded from
  any run-level aggregate. `pass` (R16/AC-24): every `must_find` matched AND no `must_not_flag`
  triggered — the empty-expected pass/fail is driven by this expectation rule, NOT the precision
  number; `citation_accuracy` never affects `pass`. NO I/O, NO LLM. Export from `reviewer-core/src/index.ts`.
  Add unit tests `reviewer-core/src/eval/score.test.ts` covering: a matched must_find, a triggered
  must_not_flag (FP), an un-annotated finding excluded from precision, empty-expected pass/fail,
  zero-must_find recall=null, citation over raw with a dropped finding.
- **Why:** Satisfies R3/R4/R5/R6/R10/R16/R17 and R21 (0 LLM calls) — the deterministic scoring crux.
- **Module:** reviewer-core
- **Type:** core
- **Skills to use:** typescript-expert, zod
- **Owned paths:** `reviewer-core/src/eval/score.ts`, `reviewer-core/src/eval/score.test.ts`,
  `reviewer-core/src/index.ts`
- **Depends-on:** T-01
- **Risk:** high
- **Known gotchas:** Must stay pure — no `fs`/DB/LLM/`process.env` (reviewer-core purity contract).
  Import `ExpectedFinding`, `Finding`, `UnifiedDiff` from `@devdigest/shared`; `groundFindings` from
  `../grounding.js`. Do not re-parse diff text here — receive the already-parsed `UnifiedDiff`.
  Guard divide-by-zero on every metric (recall zero must_find → null; citation zero raw → null;
  precision zero covered → the R10 empty case). Use array `.join(' ')` for any multi-line string to
  avoid Edit-tool quote corruption.
- **Acceptance:** `cd reviewer-core && npm test` passes including the new `score.test.ts`;
  `npm run typecheck` passes; a test asserts `scoreEvalCase` issues zero LLM calls (no `LLMProvider`
  parameter exists); `scoreEvalCase` is exported from `@devdigest/reviewer-core`.

#### T-04: Eval repository (data layer)

- **Action:** Create `server/src/modules/eval/repository.ts` (class `EvalRepository` wrapping
  `container.db`, class-wrapper pattern like `reviews/repository.ts`) plus function-level
  `server/src/modules/eval/repository/{case,run,batch}.repo.ts`. Implement: eval-case CRUD
  (`listCasesForAgent(workspaceId, agentId)` → cases where `owner_kind='agent'` and
  `owner_id=agentId`; `getCase`, `createCase`, `updateCase`, `deleteCase`); per-case run persistence
  (`insertEvalRun` into `eval_runs` with `batchId`, `caseId`, metrics, pass, actualOutput,
  durationMs, costUsd; `lastRunForCase(caseId)` for the tab's per-case state incl. "never run");
  batch persistence (`insertBatch` into `eval_run_batches`; `listBatchesForAgent`; `getBatch`;
  `runsForBatch(batchId)`); dashboard reads (`latestBatchPerAgent(workspaceId)`,
  `batchTrendForAgent(workspaceId, agentId)`, `recentBatches(workspaceId, limit)`); and
  `casesBackedByFindings(findingIds)` → the set of `source_finding_id`s that already back a case
  (for AC-26). Map DB rows → the shared DTO shapes (`EvalCase`, `EvalRunRecord`, `EvalRunBatchRecord`,
  `EvalDashboard` pieces). Add `server/src/modules/eval/repository.it.test.ts` (DB-backed) covering
  create/list/last-run/batch-insert/dashboard reads.
- **Why:** Satisfies R2/R7/R9/R18 persistence; isolates all `db/schema` access to the repository
  layer (onion Infrastructure).
- **Module:** server
- **Type:** backend
- **Skills to use:** drizzle-orm-patterns, onion-architecture-node, typescript-expert
- **Owned paths:** `server/src/modules/eval/repository.ts`,
  `server/src/modules/eval/repository/case.repo.ts`,
  `server/src/modules/eval/repository/run.repo.ts`,
  `server/src/modules/eval/repository/batch.repo.ts`,
  `server/src/modules/eval/repository.it.test.ts`
- **Depends-on:** T-01, T-02
- **Risk:** medium
- **Known gotchas:** Class-wrapper method signatures don't auto-derive from the function-level repos
  — update both. Only the repository may import `db/schema` + `drizzle-orm` (onion). `.it.test.ts`
  suffix runs only under Docker. `expected_output` is now `ExpectedFinding[]`, `input_files`/`input_meta`
  are `jsonb` — cast/parse via the shared Zod schema on read (`safeParse` to tolerate legacy rows).
- **Acceptance:** `cd server && pnpm exec vitest run server/src/modules/eval/repository.it.test`
  passes (Docker up); `cd server && pnpm exec tsc --noEmit` passes; `listCasesForAgent` returns only
  `owner_kind='agent'` rows for the given owner; `insertBatch` + `insertEvalRun(batchId)` round-trip.

#### T-06: Agent version "Promote" (repo + service + route)

- **Action:** Add `promoteVersion(workspaceId, agentId, version)` to
  `server/src/modules/agents/repository.ts` — read the target `agent_versions.configJson`
  (`getVersion`), then apply it via the existing `update()` path so the agent's active config becomes
  that snapshot and a fresh forward version is snapshotted (do not mutate history). Expose
  `AgentsService.promoteVersion(workspaceId, agentId, version)` in
  `server/src/modules/agents/service.ts`. Add `POST /agents/:id/versions/:version/promote` to
  `server/src/modules/agents/routes.ts` (Zod params, returns the updated `Agent`). Extend
  `server/src/modules/agents/routes.test.ts` with a promote test.
- **Why:** Satisfies R14 (AC-20) — no promote/activate path exists today; the Compare modal's
  "Promote vN" needs it.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, fastify-best-practices, drizzle-orm-patterns
- **Owned paths:** `server/src/modules/agents/repository.ts`,
  `server/src/modules/agents/service.ts`, `server/src/modules/agents/routes.ts`,
  `server/src/modules/agents/routes.test.ts`
- **Depends-on:** none
- **Risk:** medium
- **Known gotchas:** `update()` already bumps `version` and writes an `agent_versions` snapshot —
  reuse it rather than writing raw SQL, so version bookkeeping stays correct. Guard: promoting a
  non-existent version → 404. Route is Zod-first (no manual `.parse()` in the handler).
- **Acceptance:** `cd server && pnpm exec vitest run server/src/modules/agents/routes.test` passes;
  `POST /agents/:id/versions/:version/promote` returns the updated `Agent` whose config equals the
  promoted snapshot and whose `version` incremented; promoting a missing version returns 404.

### Phase 3 — Eval application + transport (sequential)

#### T-05: Eval service — run orchestration, scoring, create-from-finding, dashboard

- **Action:** Create `server/src/modules/eval/service.ts` (`class EvalService` built off
  `container`, holding `new EvalRepository(container.db)` + `container.agentsRepo` +
  `container.reviewRepo`). Implement:
  (a) **Run set** — `runSet(workspaceId, agentId)`: load agent + current `version`; load all its
  cases; for each case parse `input_diff` via `parseUnifiedDiff` once, call `reviewPullRequest`
  ({ systemPrompt: agent.systemPrompt, model: agent.model, diff, llm: await container.llm(agent.provider),
  strategy: agent.strategy, skills: resolved-linked-skill-bodies }), reconstruct raw findings =
  `outcome.review.findings ∪ outcome.dropped.map(d=>d.finding)`, call `scoreEvalCase(case.expected_output,
  raw, diff)`, persist a per-case `eval_runs` row (R3/R6). Aggregate across the set (recall=null when
  zero `must_find` across all cases, R17) and write one `eval_run_batches` row with `agentVersion`
  (R7). **AC-18:** wrap each case in try/catch — on failure persist that case as `pass=false` with
  the reason in `actual_output` and continue. Return the `EvalRunBatchResult`.
  (b) **Run one case** — `runCase(workspaceId, caseId)` for the editor's "Run case" / "Run on save"
  (design/05) and the Evals-tab per-case ▷ button — same per-case path, persisting an `eval_runs`
  row with **`batch_id = NULL`** and creating **NO** `eval_run_batches` row (G7: single-case runs are
  scratch; history/dashboard/Compare read batches only).
  (c) **Create from finding** — `createCaseFromFinding(workspaceId, {finding_id})` (**G6: NO `agent_id`
  in the input** — resolve it server-side): call `container.reviewRepo.findingContext(finding_id)` →
  `{finding, review, pull}`; **owner agent = `review.agentId`** — if it is **null** (nullable, no FK;
  summary/legacy reviews) return a 4xx (client disables the button, G6); derive `type` = `must_find`
  if `finding.accepted_at` set, `must_not_flag` if `dismissed_at` set (AC-1/AC-2); snapshot the whole
  PR unified diff via **`diffFromPrFiles(review.prId)`** (pure-DB snapshot, G4) + files + PR meta into
  `input_diff`/`input_files`/`input_meta` (R1/AC-3); build the single `ExpectedFinding` from the
  finding's file/start_line/end_line/severity/category/title; set `source_finding_id = finding_id`;
  always create a NEW case (AC-26). Return the created `EvalCase`.
  (d) **Case CRUD** passthroughs (`listCases`, `createCase`, `updateCase`, `deleteCase`).
  (e) **Dashboard** — `dashboard(workspaceId, agentId?)` assembling the `EvalDashboard` shape from
  repository reads (latest batch per agent, per-agent trend, recent batches, `alert` string), R9.
  (f) **Findings backed by cases** — `findingsWithCases(findingIds)` for the AC-26 hint.
  Add `server/src/modules/eval/service.it.test.ts` using a `MockLLMProvider` (deterministic
  findings) asserting: a set run writes a batch + N per-case rows with correct metrics and **0 live
  LLM calls beyond the injected mock**; a failing case (AC-18) records failure and the run
  continues; create-from-accepted → `must_find`, create-from-dismissed → `must_not_flag`.
- **Why:** Satisfies R1/R3/R5/R6/R7/R9/R11/R12/R17/R18 and the R21 success criteria (version
  recorded, sensitivity). Central orchestration reusing the existing review engine so AC-17 guard is
  inherited.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, fastify-best-practices, security, typescript-expert
- **Owned paths:** `server/src/modules/eval/service.ts`,
  `server/src/modules/eval/service.it.test.ts`, `server/src/modules/eval/helpers.ts`
- **Depends-on:** T-03, T-04
- **Risk:** high
- **Known gotchas:** Do NOT route through the fire-and-forget `runReview` (it persists to
  reviews/findings + streams SSE) — mirror `run-executor.ts:runOneAgent`'s LLM invocation directly
  and persist to eval tables. Must reuse `reviewPullRequest → assemblePrompt` so `INJECTION_GUARD`
  wraps the snapshot diff (AC-17) — never build a bespoke prompt. Resolve linked skill bodies the
  same way run-executor does (`agentsRepo.linkedSkills`, filter enabled) so a run reflects the
  agent's real config. `costUsd` may be `null` if a chunk price is unknown — propagate null, don't
  coerce to 0. This task is expected-long (multiple sub-flows); that's legitimate, not a hang.
- **Acceptance:** `cd server && pnpm exec vitest run server/src/modules/eval/service.it.test` passes;
  the set-run test asserts one `eval_run_batches` row (with the agent's `version`) + one `eval_runs`
  row per case, metrics equal to `scoreEvalCase` output, and the injected mock is the only LLM
  invoked; the AC-18 test shows a failed case recorded with a reason while siblings still ran;
  create-from-finding tests show correct `type` derivation and a snapshotted diff.

#### T-07: Eval routes + module registration

- **Action:** Create `server/src/modules/eval/routes.ts` (default-export Fastify plugin,
  `withTypeProvider<ZodTypeProvider>`, `getContext` for `workspaceId`, `new EvalService(container)`),
  wiring: `POST /agents/:id/eval-runs` (no body; runs the whole set; **rate limit
  `{ max: 10, timeWindow: '1 minute' }`** to match `reviews/routes.ts:29` and AC-27's shared limit;
  returns `EvalRunBatchResult`); `GET /agents/:id/eval-cases` (list the set, R2); `POST /agents/:id/eval-cases`
  (create); `PATCH /eval-cases/:id` (update); `DELETE /eval-cases/:id`; `POST /eval-cases/:id/run`
  (run one, design/05); `POST /agents/:id/eval-cases/from-finding` (body `EvalCaseFromFindingInput`,
  R1/AC-26); `GET /agents/:id/eval/dashboard` and `GET /eval/dashboard` (cross-agent, R9);
  `GET /agents/:id/eval-batches` (history) + `GET /eval-batches/:id/runs` (per-case drill-down);
  `GET /findings/eval-cases?ids=…` (AC-26 hint — which finding ids already back a case). Register the
  module in `server/src/modules/index.ts` (one import + one entry in the `modules` object). Add
  `server/src/modules/eval/routes.test.ts` (Zod-validation + happy-path per route with a stubbed
  service/container).
- **Why:** Satisfies R2/R3/R9/R18/R19 transport surface; exposes everything the client consumes.
- **Module:** server
- **Type:** backend
- **Skills to use:** fastify-best-practices, onion-architecture-node, zod, security
- **Owned paths:** `server/src/modules/eval/routes.ts`, `server/src/modules/eval/routes.test.ts`,
  `server/src/modules/index.ts`
- **Depends-on:** T-05
- **Risk:** medium
- **Known gotchas:** Zod-first schemas — no manual `Schema.parse()` in handlers. Keep the
  `POST /agents/:id/eval-runs` rate-limit config identical to the reviews route so AC-27's sequential
  fan-out stays under one shared 10/min budget. `modules/index.ts` is registered statically (not
  autoloaded) — add both the import and the object entry. Route paths must match exactly what the
  client hooks (T-08) call.
- **Acceptance:** `cd server && pnpm exec vitest run server/src/modules/eval/routes.test` passes;
  `cd server && pnpm exec tsc --noEmit` passes; the server boots with the eval module registered and
  `POST /agents/:id/eval-runs` returns a batch record; `POST /agents/:id/eval-cases/from-finding`
  returns the created `EvalCase`.

### Phase 4 — Client data hooks

#### T-08: Client eval hooks

- **Action:** Create `client/src/lib/hooks/eval.ts` (`"use client"`) with TanStack Query hooks
  matching T-07's routes: queries `useEvalCases(agentId)`, `useEvalDashboard()` /
  `useAgentEvalDashboard(agentId)`, `useEvalBatches(agentId)`, `useEvalBatchRuns(batchId)`,
  `useFindingsWithEvalCases(findingIds)`; mutations `useRunEvalSet(agentId)`, `useRunEvalCase()`,
  `useCreateEvalCase(agentId)`, `useUpdateEvalCase()`, `useDeleteEvalCase()`,
  `useCreateEvalCaseFromFinding(agentId)`, `usePromoteAgentVersion(agentId)` (calls
  `POST /agents/:id/versions/:version/promote` from T-06). Follow the `client/src/lib/hooks/agents.ts`
  convention exactly (`api.get/post/patch/del`, `queryKey` arrays, `invalidateQueries` on success).
  Re-export from `client/src/lib/hooks/index.ts`.
- **Why:** Satisfies the data-access needs of every client UI task (R2/R3/R8/R9/R14/R18).
- **Module:** client
- **Type:** ui
- **Skills to use:** react-best-practices, typescript-expert
- **Owned paths:** `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/index.ts`
- **Depends-on:** T-01, T-07
- **Risk:** low
- **Known gotchas:** Import DTO types from `@devdigest/shared` (client vendor copy). Invalidate the
  right keys after mutations (e.g. run-set invalidates the agent's cases + dashboard). `api.post` on
  a 204/empty body throws — eval endpoints return JSON, but if any returns an empty body use a raw
  fetch helper (per client INSIGHTS 2026-07-09).
- **Acceptance:** `cd client && pnpm typecheck` passes; each hook is exported from
  `client/src/lib/hooks/index.ts`; hook query keys and endpoint paths match T-07's routes exactly.

### Phase 5 — Client UI (parallel)

#### T-09: Eval-case editor modal

- **Action:** Create `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalCaseEditor/`
  (`EvalCaseEditor.tsx`, `styles.ts`, `constants.ts`, `EvalCaseEditor.test.tsx`) — a `Modal`-based
  editor (design/05): title "Eval case · <name>", subtitle "<Agent> · simulate a PR and assert the
  expected output". Left column: required Name field + Input sub-tabs **Diff / Files / PR meta**
  (**editable** monospace `<textarea>` fields for `input_diff` / `input_files` / `input_meta`, per
  G10 — Diff is the primary editable input, Files/PR-meta are optional JSON textareas; editable in
  BOTH new and edit modes so manual authoring (AC-23) can supply a diff from scratch). Right column: "Expected output"
  header with a live **valid-JSON badge** (green/red, R13/AC-19) + "+ Finding skeleton" button, a
  monospace JSON editor (plain `<textarea>` is sufficient — avoids the CodeMirror jsdom mock), and a
  **per-entry `must_find` / `must_not_flag` control** (toggle/badge, DIVERGENCE per design audit,
  R15/AC-23). Footer: "Run on save" toggle + Cancel / "Run case" / Save. Save is disabled while the
  JSON is invalid (R13). Wire `useCreateEvalCase` / `useUpdateEvalCase` / `useRunEvalCase` (T-08).
  Component takes props `{ agent, existingCase?, onClose }` and is imported by the Evals tab (T-10).
- **Why:** Satisfies R13/R15 (AC-19/AC-22/AC-23) and the manual-authoring path.
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-15-eval-pipeline/design/05-eval-case-editor.png` — full modal
  (Name, Diff/Files/PR-meta tabs, Expected-output JSON editor + valid-JSON badge + skeleton, Run-on-save,
  footer buttons, last-run result line).
- **Skills to use:** react-frontend-architecture, react-best-practices, react-testing-library, zod
- **Owned paths:** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalCaseEditor/**`
- **Depends-on:** T-08
- **Risk:** medium
- **Known gotchas:** Use `Modal` from `@devdigest/ui` directly (not a portal). Validate JSON with
  `try { JSON.parse } catch` (or `z.array(ExpectedFinding).safeParse`) to drive the badge + Save gate.
  RTL: use `fireEvent`, not `userEvent` (not installed). i18n strings live in
  `client/messages/en/eval.json` (`caseEditor` namespace already scaffolded) — verify keys before
  adding. Prefer a plain `<textarea>` for the JSON editor so no CodeMirror mock is needed.
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor/_components/EvalCaseEditor"`
  passes; `cd client && pnpm typecheck` passes; a test shows Save disabled while JSON is invalid and
  enabled once valid; a self-taken screenshot of the rendered modal visually matches `design/05`
  element by element (Name, three input tabs, expected-output editor + badge, footer).

#### T-11: FindingCard "Turn into eval case" action

- **Action:** In `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`
  add a "Turn into eval case" button to the action row (design/01) beside Accept/Dismiss (flask-style
  icon, e.g. `FlaskConical`/`Beaker` from the icon map — verify one exists; ghost/secondary to match
  siblings). Because "turn into eval case" is NOT a `FindingActionKind`, add a **separate** handler
  prop (e.g. `onTurnIntoEvalCase?: () => void`) rather than overloading `onAction`. Show a
  non-blocking "already has an eval case" hint when this finding's id is in the backed-by-case set
  (R18/AC-26). Wire it in the parent
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`:
  call `useCreateEvalCaseFromFinding` + `useFindingsWithEvalCases` (T-08). **G6: the mutation sends
  `{finding_id}` only — the owner agent is derived server-side from the finding's review; NO agent
  picker.** When the finding has no resolvable agent (`review.agent_id` null), **disable/hide** the
  button (tooltip "no agent for this finding"). Add/extend i18n in
  `client/messages/en/prReview.json`. Update `FindingCard.test.tsx` / `FindingsPanel` tests.
- **Why:** Satisfies R1/R18 (AC-1/AC-2/AC-3/AC-26) — the one-click entry point.
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-15-eval-pipeline/design/01-finding-card-turn-into-eval-case.png`
  — the action row with the new button beside Accept/Dismiss/Learn/Reply.
- **Skills to use:** react-frontend-architecture, react-best-practices, react-testing-library
- **Owned paths:**
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx`,
  `client/messages/en/prReview.json`
- **Depends-on:** T-08
- **Risk:** medium
- **Known gotchas:** Finding decision state is already in props (`f.accepted_at` / `f.dismissed_at`).
  Do not add "turn into eval case" to the `FindingActionKind` enum — use a distinct prop so the
  card's `onAction` contract stays intact. RTL: `fireEvent`. Target-agent resolution is RESOLVED
  (G6): server-derived from the finding's review; the client sends only `finding_id` and disables
  the button when the finding's review has no agent.
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard"`
  and the FindingsPanel test pass; `cd client && pnpm typecheck` passes; a test asserts clicking the
  button calls the create-from-finding mutation and that the "already has an eval case" hint shows
  when the finding id is in the backed set; a self-taken screenshot matches `design/01`.

#### T-12: Eval Dashboard page + sidebar nav

- **Action:** Create `client/src/app/eval/page.tsx` (non-repo-scoped, like `/conventions`; reads the
  active repo/workspace via `useActiveRepo()` where needed) + `client/src/app/eval/_components/EvalDashboardView/`
  (`EvalDashboardView.tsx`, `styles.ts`, `constants.ts`, `EvalDashboardView.test.tsx`) rendering
  design/04: header + subtitle + "Run all agents" button; AGENTS list (per-agent icon/name/model
  badge/"Last run vN · date · X/Y pass"/sparkline/Recall·Prec·Cite columns/chevron → `/eval/:agentId`);
  "RECENT EVAL RUNS · ALL AGENTS" table. "Run all agents" (R19/AC-27) calls `useRunEvalSet`
  **sequentially** over enabled agents (await each before the next). Consume `useEvalDashboard()`
  (T-08). Add the nav item to `client/src/vendor/ui/nav.ts`: insert `{ key: "eval-dashboard",
  label: "Eval Dashboard", icon: "Gauge", href: "/eval", gKey: "e" }` immediately after the
  Conventions item (line ~35) in the SKILLS LAB group, and add the matching `SHORTCUTS` entry
  (`g e`). Ensure the `href` (`/eval`) exactly matches the route path.
- **Why:** Satisfies R9/R19 (AC-15/AC-27) and the DIVERGENCE (single Eval Dashboard nav item, no
  GLOBAL group).
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-15-eval-pipeline/design/04-eval-dashboard.png` — page header +
  Run all agents, per-agent list with sparklines + metric columns, recent-runs table.
- **Skills to use:** react-frontend-architecture, react-best-practices, next-best-practices,
  react-testing-library
- **Owned paths:** `client/src/app/eval/page.tsx`,
  `client/src/app/eval/_components/EvalDashboardView/**`, `client/src/vendor/ui/nav.ts`
- **Depends-on:** T-08
- **Risk:** medium
- **Known gotchas:** nav `href` and the route folder must match exactly, or the sidebar 404s
  (project-context lesson). "Run all agents" must be sequential (AC-27) — `for … of` with `await`,
  not `Promise.all`. Nav labels are literal strings, no i18n key; page strings live in
  `client/messages/en/eval.json` (`dashboard`/`page` namespaces, already scaffolded). Keep `SHORTCUTS`
  in sync with the new nav item. a11y: metric deltas need arrow+sign, not color alone.
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/eval/_components/EvalDashboardView"`
  passes; `cd client && pnpm typecheck` passes; the sidebar shows "Eval Dashboard" after Conventions
  and navigates to `/eval`; a self-taken screenshot of `/eval` matches `design/04`.

### Phase 6 — Client UI depending on Phase 5 (parallel)

#### T-10: Evals tab + AgentEditor host wiring

- **Action:** Create `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/`
  (`EvalsTab.tsx`, `styles.ts`, `constants.ts`, `EvalsTab.test.tsx`) rendering design/03: EVAL
  METRICS row (Recall/Precision/Citation accuracy/Traces passed tiles with signed ▲/▼ deltas +
  arrow-not-color a11y), "View full dashboard →" link (navigates to `/eval`, R20/AC-28, no backend
  call), "Eval cases" header + "N/M passing" pill, per-case rows (status icon incl. distinct "never
  run", name, "expected N, got M" subtitle, severity·category badge, run/edit/delete icon buttons),
  and "Run all evals" + "+ New eval case" buttons. Consume `useEvalCases(agent.id)`,
  `useAgentEvalDashboard(agent.id)`, `useRunEvalSet`, `useDeleteEvalCase`, `useRunEvalCase` (T-08);
  open `EvalCaseEditor` (T-09) for new/edit. Wire the tab into the host: add
  `{ key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" }` to
  `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (TABS); render
  `{tab === "evals" && <EvalsTab agent={agent} />}` in
  `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`; add `"evals"` to
  `VALID_TABS` in `client/src/app/agents/[id]/page.tsx`; add `editor.tabs.evals` to
  `client/messages/en/agents.json`.
- **Why:** Satisfies R2/R3/R10/R20 (AC-4/AC-5/AC-16/AC-28) and the 4-tab-row DIVERGENCE.
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-15-eval-pipeline/design/03-agent-editor-evals-tab.png` — the
  4-tab row, EVAL METRICS tiles, View-full-dashboard link, eval-cases list with the exact five
  example states (pass / pass / fail / empty-pass / never-run), Run-all / New-case buttons.
- **Skills to use:** react-frontend-architecture, react-best-practices, react-testing-library
- **Owned paths:**
  `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**`,
  `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`,
  `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`,
  `client/src/app/agents/[id]/page.tsx`,
  `client/messages/en/agents.json`
- **Depends-on:** T-08, T-09
- **Risk:** medium
- **Known gotchas:** Must add `"evals"` to BOTH the `TABS` registry (constants.ts) AND `VALID_TABS`
  (page.tsx) or the tab is rejected and falls back to config. The tab label resolves under the
  `agents` next-intl namespace (`editor.tabs.evals` in `agents.json`), separate from `eval.json`.
  "never run" is a distinct visual state (not a fail). Verify a flask/beaker icon name exists in
  `client/src/vendor/ui/icons.tsx`; if not, use an already-registered alternative. This task spans
  the tab + metrics + case list + host wiring — legitimately sizeable; not a hang.
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab"`
  passes; `cd client && pnpm typecheck` passes; the Evals tab appears as the 4th tab and renders the
  metrics row + case list; "View full dashboard →" routes to `/eval` with no fetch; a self-taken
  screenshot matches `design/03` (incl. the five case states and never-run styling).

#### T-13: Per-agent dashboard detail + Compare-runs modal

- **Action:** Create `client/src/app/eval/[agentId]/page.tsx` +
  `client/src/app/eval/[agentId]/_components/AgentEvalDetail/` (design/06): back link, agent
  header + model badge + subtitle, warning banner from the dashboard `alert`, three metric tiles +
  sparklines, METRIC TREND multi-line chart (Recall/Precision/Citation legend), RECENT RUNS table
  with a checkbox per row enforcing **exactly two** selected + a Compare button (enabled at 2,
  R8/AC-13). Create `client/src/app/eval/[agentId]/_components/CompareRunsModal/` (design/02): title
  "Compare runs · vX → vY", four delta tiles (Recall/Precision/Citation/Cost, "old → new" + signed
  ▲/▼, a11y arrow+sign), "SYSTEM PROMPT DIFF" section (fetch the two versions' prompts via the
  existing `GET /agents/:id/versions/:version`, diff client-side), Close + "Promote vY" (calls
  `usePromoteAgentVersion` → T-06 route, R14/AC-20). Consume `useAgentEvalDashboard`,
  `useEvalBatches`, `usePromoteAgentVersion` (T-08). Add tests for both. **Header controls (G9):**
  render the agent-picker (client-side switch between `/eval/:agentId` routes), a "Run eval" button
  (reuse `useRunEvalSet` for the current agent), and a date-range picker that **filters the
  already-fetched trend/recent-runs client-side — NO backend date query param in v1**. **Metric
  deltas (C3):** signed integer percentage-points with a ▲/▼ arrow ("▲ 4pt"/"▼ 2pt"), cost as "▲
  $0.02"; always arrow+sign+color, never color alone.
- **Why:** Satisfies R8/R9/R14 (AC-12/AC-13/AC-14/AC-20).
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-15-eval-pipeline/design/06-eval-dashboard-agent-detail.png`
  (detail page: banner, tiles+sparklines, trend chart, recent-runs table with checkboxes → Compare)
  and `specs/SPEC-2026-07-15-eval-pipeline/design/02-compare-runs-modal.png` (compare modal: delta
  tiles, system-prompt diff, Close / Promote).
- **Skills to use:** react-frontend-architecture, react-best-practices, next-best-practices,
  react-testing-library
- **Owned paths:** `client/src/app/eval/[agentId]/**`
- **Depends-on:** T-08, T-12, T-06
- **Risk:** medium
- **Known gotchas:** Compare is assembled client-side — no new server compare endpoint; read the two
  versions' `system_prompt` from `agent_versions` via the existing versions route. Enforce
  exactly-two selection before enabling Compare. Metric deltas need arrow+sign (a11y), not color
  alone. `/eval/[agentId]` route path must match the chevron link built in T-12. RTL: `fireEvent`.
  For the trend/sparkline charts, follow whatever charting primitive existing dashboards use (check
  before adding a new dependency — implementers must not touch the lockfile).
- **Acceptance:** `cd client && pnpm exec vitest run "src/app/eval/[agentId]"` passes;
  `cd client && pnpm typecheck` passes; a test shows Compare enabled only at exactly two selected
  runs and "Promote vY" calling the promote mutation; self-taken screenshots match `design/06` and
  `design/02` element by element.

## Testing strategy
- Unit (reviewer-core): `cd reviewer-core && npm test` (scoring function).
- Unit (server): `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`.
- Integration (server, Docker): `cd server && pnpm exec vitest run .it.test` (eval repository +
  service).
- UI: `cd client && pnpm exec vitest run <scoped-path>` per task (NEVER `pnpm test -- <filter>`),
  then `cd client && pnpm typecheck`.
- Backend layering gate: `cd server && npm run depcruise` (no new `error`).
- Manual/visual: each UI task self-verifies with a screenshot against its cited `design/<file>`.

## Risks & mitigations
- **recall/precision raw-vs-grounded ambiguity (REC-2)** — the spec doesn't specify; a wrong default
  makes metrics incomparable. Mitigation: grilling confirms; T-03 isolates the choice in one pure
  function with tests, cheap to flip.
- **AC-26 provenance needs a schema column (REC-5)** — retrofitting a migration later is painful.
  Mitigation: include `source_finding_id` in the T-02 migration now; if grilling rejects it, drop
  the column and derive the hint some other way before Phase 5.
- **AC-20 promote is net-new infra** — risk of corrupting version history. Mitigation: implement via
  the existing `update()` snapshot path (T-06), never raw SQL; covered by a routes test.
- **Eval run cost/latency** — a set run is N LLM calls; "Run all agents" is (agents × cases).
  Mitigation: sequential execution + the shared 10/min rate limit (AC-27); acceptable for the demo
  per the spec's cost note.
- **Target-agent for create-from-finding** — RESOLVED (G6): server-derived from the finding's review
  (`{finding_id}` only); button disabled when `review.agent_id` is null. No picker in v1.
- **Out of scope (do not silently expand):** Stats/CI AgentEditor tabs, the GLOBAL nav group,
  skill-owned eval cases (`owner_kind='skill'`), LLM/semantic scoring, auto-scheduling/CI-gating —
  all Non-goals; leave as-is.

## Red-flags check
- [x] Execution mode is stated (multi-agent) and traces to the requester's "dispatched in parallel" brief; grilling to confirm
- [x] Every line in Requirements traces to a spec AC / success criterion — nothing originated here
- [x] Recommendations are separated from Requirements and marked "needs requester confirmation"
- [x] Global constraints have no internal contradictions (contracts-first; reviewer-core stays pure; INJECTION_GUARD inherited)
- [x] Every requirement maps to a task (R1→T-05/T-11; R2→T-04/T-10; R3→T-03/T-05/T-10; R4/R5/R6/R10/R16/R17→T-03; R7→T-02/T-05; R8→T-13; R9→T-04/T-05/T-12/T-13; R11→T-05; R12→T-05; R13/R15→T-01/T-09; R14→T-06/T-13; R18→T-02/T-05/T-11; R19→T-12; R20→T-10; R21→T-03/T-05)
- [x] Dependencies form a DAG (no cycles): T-01,T-02 → T-03,T-04,T-06 → T-05 → T-07 → T-08 → T-09,T-11,T-12 → T-10,T-13
- [x] Concurrent tasks have non-overlapping Owned paths and parent directories (server modules/eval vs modules/agents; client eval vs agents vs pulls; distinct `_components/` subtrees)
- [x] No phase exceeds ~5 concurrent tasks (max is 3)
- [x] No task is split by activity type into two concurrent same-file tasks (each task carries its own tests; layer splits have dependency edges, not concurrency)
- [x] Every cited path was verified via Read/Glob/Grep or marked NEW (schema, contracts, reviewer-core, reviews/agents modules, client hosts, diff-parser, review-diff precedent all read)
- [x] Every task description names exact file paths — no "update the service"
- [x] Every task is self-contained (contract ref + owned paths + runnable acceptance; no "see T-01")
- [x] Every Acceptance is a runnable command with a binary pass/fail
- [x] Each phase produces a self-consistent, mergeable state
- [x] Shared contract changes update both vendor copies in the same task (T-01)
- [x] Schema change includes `pnpm db:generate` + `pnpm db:migrate` (T-02)
- [x] Integration edge-cases are explicit: AC-17 injection guard, AC-18 continue-on-error, AC-27 rate-limited sequential fan-out, AC-26 provenance — all named in T-05/T-07/T-11
- [x] UI tasks: design audit at style level (text/icon/fill/grouping/default state); every element maps to a requirement or a spec-accepted DIVERGENCE (4-tab row, single nav item, per-entry type control)
- [x] Design assets cited from the approved spec's own `design/` folder (not duplicated, not prose); `## Design references` lists every file; every design-derived UI task carries a `Design ref:`
- [x] Orphan contracts: `EvalCase`/`EvalRun`/`EvalOwnerKind`/`EvalCaseInput`/`EvalRunRecord`/`EvalDashboard`/`EvalTrendPoint` all wired by T-01/T-04/T-05/T-08; unrelated `eval-ci.ts` shapes (Compose/CI/Conformance/Hooks) are out-of-scope — tracked in their own features, untouched here
```
