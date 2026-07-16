# Development Plan: Skills-Evals Extension (AC-29..AC-38)

## Overview
Extend the already-shipped agent-eval pipeline (AC-1..AC-28, on branch `l06-home-work`) so a
**skill** can be regression-tested the same way an agent is: an Evals tab on the Skill Editor,
"+ New eval case" authoring, and a one-click set-run that scores `recall`/`precision`/
`citation_accuracy` with the **same** owner-agnostic scorer and grounding gate. The crux (AC-38):
a skill has no system prompt, so a skill eval runs `reviewPullRequest({ systemPrompt: skill.body, diff })`
— no host agent, single run per case. The extension **generalizes** the existing agent-eval code
(batch table/contract, eval service, eval-case client editor) to be owner-generic rather than
duplicating it.

## Execution mode
**Multi-agent (parallel implementers, strict Owned-path partitioning)** — **confirmed in grilling
(2026-07-16).** The prompt requires "Owned paths (non-overlapping for parallel dispatch)", so this
plan partitions accordingly. Note the work is only *moderately* parallel: Phase 1 is a foundational
owner-generic contract/schema rename that everything else depends on, and Phase 2 (server) is
largely a dependency chain (repo → service → routes). Genuine width appears in Phase 3 (client).
Dispatch via `/run-plan`.

## Requirements
<!-- Restated from the approved spec's AC-29..AC-38 + "Resolved decisions — skills extension".
     Nothing here is originated by this plan. -->
- R1 (AC-31): The Skill Editor tab row shows an **Evals** tab alongside the existing Config,
  Preview, Context, Stats, Versions tabs (`design/07`).
- R2 (AC-29): The skill Evals tab lists every eval case where `owner_kind='skill'` and
  `owner_id=<skillId>`, showing each case's last-run pass / fail / "never run" state.
- R3 (AC-30): "+ New eval case" from a skill creates a case with `owner_kind='skill'`,
  `owner_id=<skillId>`; **no** create-from-finding path is offered on skills.
- R4 (AC-33): Either "Run all evals" (body) or "Run on evals" (header) runs every case in the
  skill's set as a single run and records `recall`/`precision`/`citation_accuracy` — both entry
  points trigger the same set-run.
- R5 (AC-38): A skill eval case produces findings by calling `reviewPullRequest` with the skill's
  `body` as the system prompt and the case's snapshotted `input_diff` as the `<untrusted>`-wrapped
  input; then scores with the same `groundFindings` gate and the same owner-agnostic pure scorer as
  agents. No host/reference agent; a single run per case.
- R6 (AC-32): The skill run scores with the **same** owner-agnostic pure scoring function and
  grounding gate as agents (AC-7..AC-11, AC-21, AC-24), zero LLM calls in the scoring step, and the
  same "n/a"/empty-set rules (AC-16, AC-25).
- R7 (AC-34): On completing a skill set-run, write one `eval_run_batches` row with
  `owner_kind='skill'`, `owner_id=<skillId>`, `owner_version=<skills.version>`, and link each
  per-case `eval_runs` row to it via `batch_id`.
- R8 (`eval_run_batches` shape resolved): Generalize `eval_run_batches` + `EvalRunBatchRecord` to
  owner-generic — `owner_kind` (`skill|agent`), `owner_id` (bare uuid, no FK), `owner_version`
  replacing `agent_id`/`agent_version`; **no** `host_agent_*` columns. A new migration backfills
  existing rows to `owner_kind='agent'`. Contract synced to both vendor copies.
- R9 (AC-35): The skill run treats the case's snapshotted diff as untrusted and wraps it with the
  same `INJECTION_GUARD` treatment as `reviewer-core/src/prompt.ts` — inherited by routing through
  `reviewPullRequest` → `assemblePrompt`.
- R10 (AC-36): If the skill run fails for one case mid set-run, record that case as failed with the
  reason and continue the remaining cases (never abort the whole run).
- R11 (AC-37): A disabled skill (`skills.enabled=false`) or a skill attached to no agent is still
  eval-able from the Evals tab — the run measures `body` directly and does not route through the
  live `enabled && skill.enabled` host-agent gate.
- R12 (success criterion): 100% of skill eval-run batches record the skill `version` scored (no
  batch with a null/unknown skill version).

**Out of scope (spec Non-goals / Deferred — do NOT plan):** skill Compare-runs / content-diff
view; listing skills on the cross-agent Eval Dashboard; create-from-finding for skills; changing
the live review pipeline, grounding logic, or `Finding`/`Review` contracts.

## Recommendations (RESOLVED in grilling, 2026-07-16)
- **Skill-run provider/model — RESOLVED: reuse the seed review default.** `ReviewInput` requires
  **both** `model: string` and a resolved `llm: LLMProvider` (`reviewer-core/src/review/run.ts:47-52`),
  which the agent path derives from `agent.provider`/`agent.model`
  (`server/src/modules/eval/service.ts:56,146-153`); a skill has neither
  (`Skill` = `body`/`version`/`enabled`, no provider/model, `knowledge.ts:142-157`). **Decision:**
  fixed eval-module constants `SKILL_EVAL_PROVIDER = 'openrouter'` and
  `SKILL_EVAL_MODEL = 'deepseek/deepseek-v4-flash'` — the exact default the built-in reviewer agents
  ship with (`server/src/db/seed.ts:12-13`) — resolved via `container.llm(SKILL_EVAL_PROVIDER)`. See
  T-04.
- **Batch fields — RESOLVED: hard rename to `owner_*` (follow spec R8).** The additive
  keep-`agent_*` alternative was considered and **rejected**: the requester chose the single clean
  owner-generic representation, accepting T-02's ~6-file mechanical rename across the agent
  Compare/Dashboard UI (contained within Phase 1). No `agent_id`/`agent_version` remain on
  `EvalRunBatchRecord`.
- **"Run on evals" header button — RESOLVED: match `design/07`.** On the **Evals tab**, the header
  top-right shows the "Run on evals" button and **not** the enabled/disabled badge (exactly as
  `design/07`); the badge renders on all other tabs. The skill's enable state stays visible via its
  toggle on the always-present left-list card, so dropping the header badge on the Evals tab loses
  no information. See the Design audit row and T-08.

## Design references
<!-- Inherited by reference from the approved spec's own design/ folder — not duplicated here. -->
| File | Shows |
| --- | --- |
| `specs/SPEC-2026-07-15-eval-pipeline/design/07-skill-editor-evals-tab.png` | Skill Editor with `pr-quality-rubric` selected (badge `rubric`, version pill `v5`); tab row Config · Context · Preview · **Evals** · Stats · Versions (Evals active); top-right **"Run on evals"** button; Evals body "Eval cases 17/20 passing", "Run all evals", "+ New eval case", per-case rows with run/edit/delete icons (stripe-key-leak pass, ssrf-webhook pass, missing-retry-after fail "got 0", clean-refactor-no-flags empty[] pass, service-role-in-client "never run") |
| `specs/SPEC-2026-07-15-eval-pipeline/design/03-agent-editor-evals-tab.png` | The **agent** Evals tab this extension generalizes from — reference only, to contrast what the skill tab keeps vs. drops (see Design audit) |

## Design audit
<!-- Re-opened `design/07` at style level. Every visible element mapped to a requirement or flagged. -->
| Panel | Element | Design file | Requirement |
| --- | --- | --- | --- |
| Editor header | Skill name + `rubric` type badge + `v5` version pill (mono, outlined) | `design/07` | Pre-existing UI (`skills/[id]/page.tsx:82-92`); `v5` already renders from `skill.version` — no change |
| Editor header, top-right | **"Run on evals"** button (▷ icon + label, dark outline) | `design/07` | R4/AC-33 — same set-run as body button. **RESOLVED (grilling 2026-07-16):** match `design/07` — on the **Evals tab** the header shows the "Run on evals" button and **not** the enabled/disabled badge; the badge (`page.tsx:88-92`) renders on all other tabs. Enable state stays visible via the left-list card toggle, so no info is lost. See T-08 |
| Editor tab row | Config · Context · Preview · **Evals** (active, underlined) · Stats · Versions | `design/07` | R1/AC-31 — Evals inserted; accepted-as-matching per prompt. **Note the design's tab ORDER is Config·Context·Preview·Evals·Stats·Versions**, but code order is Config·Preview·Context·Stats·Versions (`SkillEditor/constants.ts:9-15`). Insert Evals after Context to match design → Config·Preview·Context·Evals·Stats·Versions; the Preview/Context swap vs. design is a pre-existing divergence, not introduced here (do not reorder existing tabs) |
| Evals body header | "Eval cases" heading + `17/20 passing` amber pill | `design/07` | R2 — `<passingCount> / <total> passing` badge |
| Evals body header, right | "Run all evals" (▷ ghost) + "+ New eval case" (blue primary) | `design/07` | R4 (body run) / R3 (new case) |
| Evals body | Per-case rows: status icon (green check / red x / hollow "never run" dot), mono case name, subtitle "expected N finding(s), got M" or "never run", right-aligned `CRITICAL · security` / `empty []` badge, ▷/edit/trash icon buttons | `design/07` | R2 — mirrors agent `CaseRow` (`AgentEditor/.../EvalsTab.tsx:59-105`); reuse the same never-run / empty-[] rendering |
| Evals body | **No** EVAL METRICS tile row (Recall/Precision/Citation/Traces), **no** "View full dashboard →" link | `design/07` (contrast `design/03` which HAS them) | Deliberate simplification — skills are not on the cross-agent dashboard (Non-goal). The skill tab omits the metrics tiles + dashboard link the agent tab shows. Documented, not a gap |
| Left skill-list cards | type badge, source, "N agents · X% pull · Y% accept", enable toggle | `design/07` | Pre-existing skill UI (`Skill.agent_count`/`pull_pct`/`accept_pct`) — context only, no requirement (spec Edge cases) |

## Affected modules & contracts
- `@devdigest/shared` (both vendor copies) — `EvalRunBatchRecord` becomes owner-generic
  (`owner_kind`/`owner_id`/`owner_version`).
- `server/` eval module — schema (`eval_run_batches`), new migration, batch repo, eval-case repo
  (owner-generic reads), `EvalService` (skill run path), eval routes (`/skills/:id/...`).
- `server/` platform — `container.skillsRepo` getter (DI, mirrors `agentsRepo`).
- `client/` — new SkillEditor Evals tab, owner-generic eval hooks, relocated/generalized
  `EvalCaseEditor`, agent Compare/Dashboard field rename, "Run on evals" header button.
- Contracts to change: `EvalRunBatchRecord` (existing, both copies). No new contract files.

## Architecture notes
- **Owner-generic batch, mirroring the `eval_cases` precedent.** `eval_cases` already carries its
  own `workspace_id` column + owner-generic (`owner_kind`/`owner_id`, no FK) columns
  (`server/src/db/schema/eval.ts:10-14`). `eval_run_batches` today instead relies on a join through
  `agents.workspace_id` for tenancy scoping (`batch.repo.ts:69,83,98,113,133,148`) — that join
  **cannot** scope a skill batch (a skill batch's `owner_id` is a skillId, not an agentId). So the
  correct generalization adds a **`workspace_id` column directly to `eval_run_batches`** (backfilled
  from `agents.workspace_id`) and scopes reads by it, exactly as `eval_cases` does. This keeps a
  skill batch scopable without a per-owner join and is consistent with the resolved "mirror the
  `eval_cases` precedent" decision.
- **Agent dashboard/overview stay agent-only after generalization.** Add an explicit
  `owner_kind='agent'` filter to the agent-scoped batch reads (`listBatchesForAgent`,
  `latestBatchPerAgent`, `batchTrendForAgent`, `recentBatches`) so skill batches never leak into the
  agent dashboard/overview once both owner kinds write to the shared table.
- **Onion/DI.** Skill access from `EvalService` goes through a new `container.skillsRepo` getter
  (composition root), mirroring `container.agentsRepo` (`container.ts:95-97`) — the service must not
  reach into `modules/skills/` directly. Routes stay transport-only; all logic in `EvalService`;
  all DB in `EvalRepository`/`repository/*.repo.ts`.
- **reviewer-core is untouched.** `scoreEvalCase` (`reviewer-core/src/eval/score.ts:49`) and
  `groundFindings` are already owner-agnostic `(expected, rawFindings, diff)`; the skill path reuses
  them verbatim. No reviewer-core change in this extension.
- **INJECTION_GUARD inherited.** The skill run calls `reviewPullRequest` (which calls
  `assemblePrompt`), so the snapshotted diff is `<untrusted>`-wrapped automatically (AC-35). The
  skill `body` is trusted workspace text promoted to `systemPrompt` — intentional per AC-38.
- **Raw pre-grounding findings for `citation_accuracy`.** The agent path reconstructs raw findings
  as `outcome.review.findings ∪ outcome.dropped.map(d => d.finding)` (`service.ts:154`); the skill
  path reuses the identical reconstruction.

**Skill set-run flow (generalizes the agent flow; the only difference is how findings are produced):**

```mermaid
flowchart TD
    A([POST /skills/:id/eval-runs  OR  header "Run on evals"]) --> B[Load skill + skills.version via container.skillsRepo]
    B --> C[Load eval_cases where owner_kind='skill', owner_id=id]
    C --> D{for each case}
    D --> E[["reviewPullRequest(systemPrompt = skill.body,<br/>model/llm = SKILL_EVAL default, diff = case.input_diff)<br/>— assemblePrompt wraps diff in &lt;untrusted&gt; (AC-35)"]]
    E --> F[groundFindings: kept vs dropped — REUSED unchanged]
    F --> G[scoreEvalCase: raw = review.findings ∪ dropped — REUSED, zero LLM]
    G --> H[Persist per-case eval_run: recall/precision/citation/pass/cost, batchId]
    H --> D
    D -->|per-case error| H2[AC-36: record case failed w/ reason, continue]
    H2 --> D
    D -->|done| I[aggregateBatch + insertBatch owner_kind='skill', owner_id, owner_version=skills.version]
    I --> J([Batch written; tab re-reads last-runs → per-case pass/fail])
```

## INSIGHTS summary
- [server]: `pnpm db:generate` diffs schema files against the journal and emits a new `.sql` — never
  hand-write or edit a **prior** migration; always `pnpm db:migrate` after. Editing the freshly
  generated migration to add the backfill `UPDATE` is the accepted path here (`src/db/migrations/`).
- [server]: `eval_run_batches` has no `workspace_id` today; every scoped read joins through
  `agents.workspace_id` (IDOR-avoidance pattern). Generalizing to skills requires the direct
  `workspace_id` column (see Architecture notes) (`modules/eval/repository/batch.repo.ts`).
- [server]: `SkillsService.get()` must call `statsForSkills([id])` explicitly — but the skill-eval
  run only needs `body`/`version`/`enabled`, so `skillsRepo.getById` (raw row) is sufficient and
  cheaper; do not route the eval run through the stats-enriched DTO.
- [client]: `client/src/vendor/shared/` is a **manual copy** of `server/src/vendor/shared/` — the
  `EvalRunBatchRecord` change must land in **both** copies in the same task.
- [client]: Sidebar nav lives in `vendor/ui/nav.ts`; "Eval Dashboard" already exists there — no nav
  change is needed for this extension.

## Phased tasks

> Phase boundaries are the mergeable units. Phase 1 is a foundational rename that intentionally
> leaves the tree non-compiling *between* its two tasks but self-consistent once both land.

### Phase 1 — Owner-generic batch foundation

#### T-01: Generalize `eval_run_batches` + `EvalRunBatchRecord` to owner-generic (server)

- **Action:** (1) In **both** `server/src/vendor/shared/contracts/eval-ci.ts` and
  `client/src/vendor/shared/contracts/eval-ci.ts`, change `EvalRunBatchRecord` (currently lines
  62-74): replace `agent_id: z.string()` + `agent_version: z.number().int()` with
  `owner_kind: EvalOwnerKind`, `owner_id: z.string()`, `owner_version: z.number().int()` (import
  `EvalOwnerKind` from `./knowledge.js`; it is already imported in `eval-ci.ts:3`). `EvalRunBatchResult`
  (=`EvalRunBatchRecord`) and `EvalDashboardOverview.recent_runs`
  (`EvalRunBatchRecord.extend({ agent_name })`) follow automatically.
  (2) In `server/src/db/schema/eval.ts` `evalRunBatches` (lines 30-43): add
  `workspaceId` (uuid, FK `workspaces.id` onDelete cascade, notNull), `ownerKind`
  (`text enum ['skill','agent']`, notNull), `ownerId` (uuid, notNull, **no** FK), `ownerVersion`
  (integer, notNull); remove `agentId` + `agentVersion`.
  (3) `cd server && pnpm db:generate`, then **edit the newly generated migration** to backfill
  before dropping: add new columns nullable → `UPDATE eval_run_batches SET owner_kind='agent',
  owner_id=agent_id, owner_version=agent_version, workspace_id=(SELECT workspace_id FROM agents
  WHERE agents.id = eval_run_batches.agent_id)` → set the new columns NOT NULL → drop
  `agent_id`/`agent_version`. Then `pnpm db:migrate`.
  (4) `server/src/modules/eval/repository/batch.repo.ts`: update `EvalRunBatchRow`/`toBatchRecord`
  (map `owner_kind`/`owner_id`/`owner_version`), `InsertBatchInput` + `insertBatch` (accept
  `workspaceId`, `ownerKind`, `ownerId`, `ownerVersion`), and switch every scoped read to filter by
  `evalRunBatches.workspaceId` directly instead of the `agents` join; add an explicit
  `eq(evalRunBatches.ownerKind, 'agent')` (+ `eq(ownerId, agentId)`) filter to `listBatchesForAgent`,
  `latestBatchPerAgent`, `batchTrendForAgent`, `recentBatches` so agent reads exclude skill batches.
  `recentBatches` still joins `agents` for `agent_name` (now on `agents.id = ownerId`).
  (5) `server/src/modules/eval/service.ts`: `runSet` `insertBatch(...)` call now passes
  `workspaceId`, `ownerKind: 'agent'`, `ownerId: agent.id`, `ownerVersion: agent.version`; the
  regression-alert call already uses a generic `latestVersion` param — source it from
  `latest?.owner_version`.
  (6) Update server eval tests that assert `agent_id`/`agent_version` on batch rows
  (`repository.it.test.ts`, `service.it.test.ts`, `routes.test.ts`, `helpers.test.ts` if any).
- **Why:** R8 — the batch layer must be owner-generic before a skill run can persist a batch
  (R7/AC-34). Without `workspace_id` on the table, skill batches cannot be tenancy-scoped.
- **Module:** server
- **Type:** backend
- **Skills to use:** drizzle-orm-patterns, postgresql-table-design, onion-architecture-node,
  fastify-best-practices, zod, typescript-expert
- **Owned paths:** `server/src/vendor/shared/contracts/eval-ci.ts`,
  `client/src/vendor/shared/contracts/eval-ci.ts`, `server/src/db/schema/eval.ts`,
  `server/src/db/migrations/` (the new generated `.sql` + meta only — never edit prior files),
  `server/src/modules/eval/repository/batch.repo.ts`, `server/src/modules/eval/service.ts`,
  `server/src/modules/eval/repository.it.test.ts`, `server/src/modules/eval/service.it.test.ts`,
  `server/src/modules/eval/routes.test.ts`, `server/src/modules/eval/helpers.test.ts`
- **Depends-on:** none
- **Risk:** high
- **Known gotchas:** Never edit a prior migration; edit only the freshly generated one to add the
  backfill `UPDATE` between add-column and drop-column (server INSIGHTS). The vendor contract change
  must be identical in both copies (client INSIGHTS). Adding the `owner_kind='agent'` filter to
  agent reads is required so skill batches (written later) never leak into the agent dashboard.
- **Acceptance:** `cd server && pnpm exec vitest run modules/eval` passes (incl. the `.it.test`
  files after `pnpm db:migrate`); `cd server && pnpm exec tsc --noEmit` passes; a query on the
  migrated `eval_run_batches` shows every pre-existing row has `owner_kind='agent'`,
  `owner_id`=old `agent_id`, `owner_version`=old `agent_version`, and a non-null `workspace_id`.

#### T-02: Rename batch-record fields in agent Compare/Dashboard UI (client)

- **Action:** Update every read of the renamed `EvalRunBatchRecord` fields (`agent_version` →
  `owner_version`, `agent_id` → `owner_id`) — the overview's own `agents[].agent_id`/`agent_name`
  and `recent_runs[].agent_name` fields are **unchanged** (they are not on the batch record). Files
  and known lines: `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx`
  (`batch.agent_version`→`owner_version` L133; `run.agent_id`→`owner_id` L166,
  `run.agent_version`→`owner_version` L167; `agent.agent_id`/`agent.agent_name` L38/92/120/126 stay);
  `client/src/app/eval/[agentId]/_components/CompareRunsModal/CompareRunsModal.tsx` (`.agent_version`
  at L40,41,53,62,70,115,119 → `owner_version`);
  `client/src/app/eval/[agentId]/_components/AgentEvalDetail/AgentEvalDetail.tsx`
  (`run.agent_version`→`owner_version` L73,320; `a.agent_id`/`a.agent_name` L77 stay). Update the
  matching test fixtures/assertions in `EvalDashboardView.test.tsx`, `CompareRunsModal.test.tsx`,
  `AgentEvalDetail.test.tsx` (batch fixtures set `agent_id`/`agent_version` → `owner_kind:'agent'`,
  `owner_id`, `owner_version`).
- **Why:** R8 — after T-01 renames the shared contract, the working agent Compare/Dashboard views
  no longer typecheck until they read `owner_*`. Purely mechanical; preserves AC-13/AC-14/AC-15/AC-20.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-frontend-architecture, react-best-practices, typescript-expert,
  react-testing-library
- **Owned paths:** `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx`,
  `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.test.tsx`,
  `client/src/app/eval/[agentId]/_components/CompareRunsModal/CompareRunsModal.tsx`,
  `client/src/app/eval/[agentId]/_components/CompareRunsModal/CompareRunsModal.test.tsx`,
  `client/src/app/eval/[agentId]/_components/AgentEvalDetail/AgentEvalDetail.tsx`,
  `client/src/app/eval/[agentId]/_components/AgentEvalDetail/AgentEvalDetail.test.tsx`
- **Depends-on:** T-01
- **Risk:** medium
- **Known gotchas:** Do NOT rename `agents[].agent_id`/`agent_name` (overview entry fields) or
  `recent_runs[].agent_name` (extend field) — only the embedded batch record's `agent_id`/
  `agent_version` moved to `owner_id`/`owner_version`. If the requester accepts the "retain agent_*"
  recommendation above, this task collapses to near-zero.
- **Acceptance:** `cd client && pnpm exec vitest run src/app/eval` passes; `cd client && pnpm typecheck`
  passes.

### Phase 2 — Server skill-eval engine

#### T-03: `container.skillsRepo` + owner-generic eval-case repository reads (server)

- **Action:** (1) `server/src/platform/container.ts`: add a `skillsRepo` getter mirroring
  `agentsRepo` (L95-97) — `import { SkillsRepository } from '../modules/skills/repository.js'`,
  private `_skillsRepo?`, `get skillsRepo(): SkillsRepository { return (this._skillsRepo ??= new
  SkillsRepository(this.db)); }`. (2) `server/src/modules/eval/repository/case.repo.ts`: add
  `listCasesForOwner(db, workspaceId, ownerKind, ownerId)` generalizing `listCasesForAgent`
  (the existing agent method may delegate to it with `'agent'`, or stay — keep the agent method
  working). (3) `server/src/modules/eval/repository.ts`: expose `listCasesForOwner` passthrough
  (mirroring `listCasesForAgent`).
- **Why:** R2/R5 — the skill run and skill case-list need owner-generic case reads and DI-correct
  skill access without the service reaching into `modules/skills/`.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, drizzle-orm-patterns, typescript-expert
- **Owned paths:** `server/src/platform/container.ts`,
  `server/src/modules/eval/repository/case.repo.ts`, `server/src/modules/eval/repository.ts`
- **Depends-on:** none (may run concurrently with Phase 1 — touches no Phase-1 owned path; but keep
  it in Phase 2 since T-04 consumes it)
- **Risk:** low
- **Known gotchas:** `SkillsRepository.getById(workspaceId, id)` returns the raw skill row
  (`body`/`version`/`enabled`) — sufficient for the run; do not use the stats-enriched
  `SkillsService.get`.
- **Acceptance:** `cd server && pnpm exec tsc --noEmit` passes; `cd server && pnpm exec vitest run
  modules/eval` passes; a repo unit test asserts `listCasesForOwner(ws,'skill',skillId)` returns
  only `owner_kind='skill'` rows for that owner.

#### T-04: Skill run path in `EvalService` (server)

- **Action:** (1) Add an eval-module constant file (e.g.
  `server/src/modules/eval/skill-run.constants.ts`) exporting **`SKILL_EVAL_PROVIDER = 'openrouter'`**
  and **`SKILL_EVAL_MODEL = 'deepseek/deepseek-v4-flash'`** — the built-in reviewer-agent seed default
  (`server/src/db/seed.ts:12-13`), resolved in grilling (2026-07-16). (2) In
  `server/src/modules/eval/service.ts`, add `runSkillSet(workspaceId, skillId)` and generalize the
  case-execution: reuse the existing private `executeCase` shape but for a skill, resolve
  `llm = await this.container.llm(SKILL_EVAL_PROVIDER)`, call `reviewPullRequest({ systemPrompt:
  skill.body, model: SKILL_EVAL_MODEL, diff, llm })` (no `skills[]`, no agent strategy), reconstruct
  raw findings identically (`review.findings ∪ dropped`), score with `scoreEvalCase`. Per-case
  failure isolation (AC-36) is inherited from `executeCase`'s try/catch. Write the batch via the
  T-01 owner-generic `insertBatch` with `ownerKind:'skill'`, `ownerId: skill.id`,
  `ownerVersion: skill.version`, `workspaceId`. Load the skill via `container.skillsRepo.getById`
  (raw row → `body`/`version`); do **not** gate on `enabled` (AC-37). (3) Generalize `runCase`
  (currently throws `unsupported_case_owner` for non-agent, `service.ts:102-108`) so a
  `owner_kind='skill'` case runs the single-case skill path (scratch run, `batchId=null`),
  resolving the skill from `evalCase.owner_id`. (4) Add a `listCases` overload / `listSkillCases`
  passthrough using `repo.listCasesForOwner(ws,'skill',skillId)`, and a `lastRunsForSkill`
  reusing the owner-generic last-runs read (the existing `lastRunsForAgentCases` filters by
  `ownerKind='agent'` in `run.repo.ts` — generalize it to `lastRunsForOwnerCases` or add a skill
  variant; if `run.repo.ts` needs a change, note it here and own it).
- **Why:** R5/R6/R7/R10/R11 — the crux execution model. Produces findings from `skill.body` as
  system prompt with no host agent, scores with the shared owner-agnostic scorer, and persists the
  skill-versioned batch.
- **Module:** server
- **Type:** backend
- **Skills to use:** onion-architecture-node, fastify-best-practices, drizzle-orm-patterns, security,
  typescript-expert
- **Owned paths:** `server/src/modules/eval/service.ts`,
  `server/src/modules/eval/skill-run.constants.ts` (NEW FILE),
  `server/src/modules/eval/repository/run.repo.ts`
- **Depends-on:** T-01, T-03
- **Known gotchas:** `reviewPullRequest` requires a real `model` + resolved `llm` — a skill has
  neither of its own (Recommendation #1). Route through `reviewPullRequest`/`assemblePrompt` so the
  diff is `<untrusted>`-wrapped (AC-35); never build a bespoke prompt path. Do not gate on
  `skills.enabled` (AC-37).
- **Risk:** medium
- **Acceptance:** `cd server && pnpm exec vitest run modules/eval` passes including a new
  `service.it.test.ts` case that: runs a skill set over ≥1 case with a mocked `llm`
  (`ContainerOverrides.llm`), asserts a `eval_run_batches` row with `owner_kind='skill'`,
  `owner_version = skill.version`, one `eval_runs` row per case linked by `batch_id`, and that the
  scoring step issues **0** LLM calls (only the per-case review call runs); and a disabled skill
  (`enabled=false`) still produces a batch (AC-37).

#### T-05: Skill eval routes (server)

- **Action:** In `server/src/modules/eval/routes.ts` add, mirroring the agent routes:
  `POST /skills/:id/eval-runs` (rate-limited `{ max: 10, timeWindow: '1 minute' }` exactly like the
  agent run route L46-48 — AC-33 both entry points hit this one route) → `service.runSkillSet(ws, id)`;
  `GET /skills/:id/eval-cases` → `service.listSkillCases(ws, id)`;
  `GET /skills/:id/eval-cases/last-runs` → `service.lastRunsForSkill(ws, id)`;
  `POST /skills/:id/eval-cases` (body `EvalCaseInput`, status 201) → `service.createCase(ws, body)`.
  Do **not** add a skill create-from-finding route (AC-30/Non-goal). Per-case run/edit/delete reuse
  the existing owner-agnostic `POST /eval-cases/:id/run`, `PATCH /eval-cases/:id`,
  `DELETE /eval-cases/:id` (unchanged). Add route tests in `routes.test.ts`.
- **Why:** R2/R3/R4 — transport for the skill Evals tab; the run route is the single set-run entry
  point both "Run all evals" and "Run on evals" call.
- **Module:** server
- **Type:** backend
- **Skills to use:** fastify-best-practices, onion-architecture-node, zod, security, typescript-expert
- **Owned paths:** `server/src/modules/eval/routes.ts`, `server/src/modules/eval/routes.test.ts`
- **Depends-on:** T-04
- **Known gotchas:** routes stay transport-only (no logic); reuse `getContext` + `IdParams` +
  `EvalCaseInput` exactly as the agent routes do. The `EvalCaseInput` body already carries
  `owner_kind`/`owner_id`, so the client sets `owner_kind:'skill'` (T-06) — the route does not inject
  owner fields (same as the agent create route L73-82).
- **Risk:** low
- **Acceptance:** `cd server && pnpm exec vitest run modules/eval/routes.test.ts` passes, asserting
  `POST /skills/:id/eval-runs` returns a batch with `owner_kind:'skill'`, `GET /skills/:id/eval-cases`
  returns only that skill's cases, and the run route carries the 10/min rate-limit config.

### Phase 3 — Client skill Evals tab

#### T-06: Owner-generic client eval hooks for skills (client)

- **Action:** Extend `client/src/lib/hooks/eval.ts` (additively — do not break agent hooks) with
  skill-owner hooks: `useSkillEvalCases(skillId)` (`GET /skills/:id/eval-cases`),
  `useSkillEvalCaseLastRuns(skillId)` (`GET /skills/:id/eval-cases/last-runs`),
  `useRunSkillEvalSet(skillId)` (`POST /skills/:id/eval-runs`, invalidating `["skill-eval-cases",
  skillId]` + `["skill-eval-case-last-runs", skillId]`), `useCreateSkillEvalCase(skillId)`
  (`POST /skills/:id/eval-cases`, injecting `owner_kind:'skill'`, `owner_id:skillId` — mirror
  `useCreateEvalCase` L143-154). Reuse the existing owner-agnostic `useRunEvalCase`,
  `useUpdateEvalCase`, `useDeleteEvalCase` (they key on `caseId` and already accept an optional
  scoping id — extend their invalidation to accept a skill scope, or pass no scope). Use distinct
  query keys (`"skill-eval-cases"`, `"skill-eval-case-last-runs"`) so agent and skill caches don't
  collide.
- **Why:** R2/R3/R4 — data layer for the skill Evals tab, owner-generic and additive so the working
  agent hooks are untouched.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-frontend-architecture, next-best-practices, typescript-expert
- **Owned paths:** `client/src/lib/hooks/eval.ts`
- **Depends-on:** T-05
- **Known gotchas:** `EvalCaseInput` requires `owner_kind`/`owner_id`; the create hook injects
  `'skill'` + skillId just as the agent hook injects `'agent'` + agentId. Keep skill query keys
  distinct from agent ones.
- **Risk:** low
- **Acceptance:** `cd client && pnpm typecheck` passes; `cd client && pnpm exec vitest run
  src/lib/hooks` passes (add a hook test only if a sibling test file exists there — otherwise
  typecheck + a consuming-component test in T-08 covers it).

#### T-07: Relocate + generalize `EvalCaseEditor` to owner-generic shared component (client)

- **Action:** Move `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalCaseEditor/`
  to `client/src/components/eval/EvalCaseEditor/` and generalize its `agent: Agent` prop to an owner
  descriptor (e.g. `owner: { kind: 'agent'|'skill'; id: string }`, plus whatever display fields the
  editor actually reads). Wire create/update/run through the owner-generic hooks: for an agent owner
  use the existing agent create/update hooks, for a skill owner use `useCreateSkillEvalCase`
  (T-06). Update the agent `EvalsTab.tsx` import
  (`client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx:16`) to the
  new location and pass `owner={{ kind:'agent', id: agent.id }}`. Move/update the editor's test
  alongside it. Preserve all existing agent behavior (Diff/Files/PR-meta tabs, expected-output JSON
  validity badge AC-19, Run-on-save, Run-case).
- **Why:** R3 — the "+ New eval case" modal is reused by both editors; generalizing (not
  duplicating) it satisfies the "maximally reuse" mandate and avoids a cross-feature import from
  `skills/` into `agents/`.
- **Module:** client
- **Type:** ui
- **Skills to use:** react-frontend-architecture, react-best-practices, react-testing-library,
  typescript-expert
- **Owned paths:** `client/src/components/eval/EvalCaseEditor/` (NEW — moved here),
  `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalCaseEditor/` (removed),
  `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` (import +
  prop only)
- **Depends-on:** T-06
- **Known gotchas:** `EvalsTab.tsx` also lives under the AgentEditor folder — this task touches only
  its `EvalCaseEditor` import + the `owner` prop it passes; it does not otherwise modify EvalsTab.
  Keep the agent editor's tests green (relocate the test file with the component).
- **Risk:** medium
- **Acceptance:** `cd client && pnpm exec vitest run src/components/eval src/app/agents` passes;
  `cd client && pnpm typecheck` passes; the agent Evals tab still opens/saves/runs a case unchanged.

#### T-08: SkillEditor Evals tab + "Run on evals" header button (client)

- **Action:** (1) `client/src/app/skills/[id]/_components/SkillEditor/constants.ts`: add
  `{ key: "evals", label: "Evals", icon: <appropriate IconName, e.g. "Gauge"/"Target"> }` **after**
  the `context` entry so the row reads Config·Preview·Context·**Evals**·Stats·Versions (the
  Preview/Context order vs. design is pre-existing — do not reorder existing tabs). (2) New
  `client/src/app/skills/[id]/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx` (+ `styles.ts`,
  `constants.ts` as needed) — a **trimmed** variant of the agent `EvalsTab` (`design/07`): "Eval
  cases" heading + `<passing>/<total> passing` badge, "Run all evals" (ghost, `useRunSkillEvalSet`)
  + "+ New eval case" (primary, opens the relocated `EvalCaseEditor` with
  `owner={{ kind:'skill', id: skill.id }}`), and per-case rows reusing the same pass/fail/never-run
  + `empty []` rendering as the agent tab. **Omit** the EVAL METRICS tile row and "View full
  dashboard →" link (not in `design/07`; skills not on dashboard). Sources: `useSkillEvalCases`,
  `useSkillEvalCaseLastRuns`, `useRunSkillEvalCase`/`useDeleteEvalCase`. (3)
  `SkillEditor.tsx`: render `{tab === "evals" && <EvalsTab skill={skill} />}`. (4)
  `client/src/app/skills/[id]/page.tsx`: in the header top-right region (L88-92), **when
  `tab === 'evals'` render a "Run on evals" button in place of the enabled/disabled badge** (match
  `design/07`); on all other tabs keep the existing badge. The button calls the same
  `useRunSkillEvalSet(id).mutate()` (AC-33 — same action as the body button). Resolved in grilling
  (2026-07-16); enable state remains visible via the left-list card toggle.
- **Why:** R1/R2/R3/R4 — the skill Evals tab and its two equivalent run entry points; the whole
  user-facing surface of this extension.
- **Module:** client
- **Type:** ui
- **Design ref:** `specs/SPEC-2026-07-15-eval-pipeline/design/07-skill-editor-evals-tab.png` —
  Skill Editor → Evals tab (tab row, "17/20 passing", "Run all evals"/"+ New eval case", per-case
  rows) and the header "Run on evals" button.
- **Skills to use:** react-frontend-architecture, react-best-practices, next-best-practices,
  react-testing-library, typescript-expert
- **Owned paths:** `client/src/app/skills/[id]/_components/SkillEditor/_components/EvalsTab/` (NEW),
  `client/src/app/skills/[id]/_components/SkillEditor/constants.ts`,
  `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx`,
  `client/src/app/skills/[id]/page.tsx`
- **Depends-on:** T-06, T-07
- **Known gotchas:** `VALID_TABS` derives from `TABS` (`constants.ts:17`) so the new tab is
  URL-routable automatically. Reuse the never-run / empty-[] rendering exactly (design/07 mirrors
  design/03 for those states). Do not add metric tiles or a dashboard link (not in design/07).
- **Risk:** medium
- **Acceptance:** `cd client && pnpm exec vitest run src/app/skills` passes (a new EvalsTab test:
  renders cases with pass/fail/never-run + `X/Y passing`, "Run all evals" calls the set-run,
  "+ New eval case" opens the editor); `cd client && pnpm typecheck` passes; a self-taken screenshot
  of the rendered Skill Editor → Evals tab visually matches `design/07` element by element (tab row,
  passing pill, both run entry points, per-case rows with run/edit/delete icons).

## Testing strategy
- Unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`;
  `cd client && pnpm exec vitest run`
- Integration (server, requires Docker + `pnpm db:migrate`): `cd server && pnpm exec vitest run .it.test`
- UI: `cd client && pnpm test && pnpm typecheck`
- Focused: `cd server && pnpm exec vitest run modules/eval`; `cd client && pnpm exec vitest run
  src/app/skills src/components/eval`

## Risks & mitigations
- **`eval_run_batches` migration data-loss / bad backfill** (high) — the hand-edited generated
  migration must backfill `owner_*` + `workspace_id` before dropping `agent_*`. Mitigation: order
  the DDL add-nullable → UPDATE → set-NOT-NULL → drop; verify in T-01 acceptance that every existing
  row migrated to `owner_kind='agent'` with a non-null `workspace_id`. Never edit prior migrations.
- **Contract rename ripple into working agent UI** (medium) — T-01's field rename breaks agent
  Compare/Dashboard until T-02. Mitigation: T-01+T-02 are one mergeable phase; or accept the
  "retain agent_*" recommendation to avoid the churn entirely.
- **Under-specified skill-run provider/model** (high) — AC-38 omits which model/llm a host-less
  skill run uses. Mitigation: Recommendation #1 + grilling must fix the values before T-04.
- **`EvalCaseEditor` relocation regressing the agent editor** (medium) — Mitigation: relocate the
  test with the component; T-07 acceptance re-runs the agent Evals tests.
- **Out-of-scope creep** — skill Compare view and skills-on-dashboard are explicitly deferred; if a
  reviewer requests them, flag rather than build.

## Red-flags check
- [x] Execution mode is stated (multi-agent) and flagged for grilling confirmation
- [x] Every Requirements line traces to an approved AC / resolved decision — none originated here
- [x] Recommendations are separated from Requirements and marked needs-confirmation
- [x] Global constraints have no internal contradictions (owner-generic batch is consistent across schema/contract/repo/service)
- [x] Every requirement maps to a task (R1→T-08; R2→T-03/T-05/T-06/T-08; R3→T-05/T-06/T-07/T-08; R4→T-05/T-06/T-08; R5/R6/R10/R11→T-04; R7/R8/R12→T-01/T-04; R9→T-04)
- [x] Dependencies form a DAG (T-01→T-02; T-03; T-01,T-03→T-04→T-05; T-05→T-06→T-07→T-08) — no cycles
- [x] Concurrent tasks have non-overlapping Owned paths and parent directories (T-01 server / T-02 client run sequentially; within phases owned paths are disjoint)
- [x] No phase exceeds ~7 concurrent tasks
- [x] No task split by activity type forcing two concurrent tasks onto the same files (tests live with their impl task)
- [x] Every cited path verified with Read/Glob or marked (NEW FILE)
- [x] Every task names exact file paths (+ known line numbers)
- [x] Every task is self-contained (contract ref, owned paths, runnable acceptance)
- [x] Every Acceptance is a runnable command with binary pass/fail
- [x] Each phase reaches a self-consistent, mergeable state
- [x] Shared contract change assigns both vendor copies to the same task (T-01)
- [x] Schema change includes `pnpm db:generate` + `pnpm db:migrate` in the task (T-01)
- [x] Integration edge-cases explicit: rate-limit (T-05), AC-36 per-case failure + AC-37 disabled-skill (T-04), INJECTION_GUARD via reviewPullRequest (T-04)
- [x] UI design audit done at style level; every design/07 element mapped or flagged (GAP: header button vs enabled badge)
- [x] Design assets persisted as real files — inherited by reference from the approved spec's `design/` folder; `## Design references` cites them; the UI task (T-08) carries a `Design ref:`
- [x] Orphan contracts: `EvalRunBatchRecord` is the only touched shared contract; its change is owned by T-01 in both copies. No new Zod schema is left unimplemented.
