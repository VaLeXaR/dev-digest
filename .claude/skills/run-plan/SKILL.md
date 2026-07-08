---
name: run-plan
description: "Executes an already-approved, already-grilled Development Plan end to end: multi-agent implementer → plan-verifier (functional pass) → architecture-reviewer (fix-iterate loop) → final plan-verifier gate. Does NOT create specs or plans — spec-creator, spec-clarification, implementation-planner, and grilling are run manually before this skill. Test-writer is disabled by default (cost). Use via /run-plan docs/plans/<name>.md when a plan is ready to build."
user-invocable: true
version: "1.2.0"
---

# run-plan — execute a Development Plan

You are the **coordinator** for the build-and-verify half of the pipeline documented in
`AGENTS.md`'s "Spec-Driven Development pipeline" section:

```
(done manually, before this skill: spec-creator → spec-clarification → implementation-planner → grilling)

              ┌─────────────────── this skill ───────────────────┐
docs/plans/<name>.md
   → implementer ×N (multi-agent or single-agent, per plan)
   → plan-verifier (functional pass)
   → architecture-reviewer  ⇄  fix-iterate loop
   → [test-writer — disabled by default, see Stage 4]
   → plan-verifier (final gate)
              └─────────────────────────────────────────────────┘
   → pr-self-review (hook-enforced on git push — not this skill's job)
```

**This skill does not create or clarify specs or plans.** `spec-creator`, `spec-clarification`,
`implementation-planner`, and `grilling` are dispatched by hand, separately, before you ever
invoke `/run-plan`. If the user hands you a raw feature request instead of a plan file path, stop
and tell them to run `implementation-planner` (and `grilling`) first — do not draft a plan
yourself and do not silently fall back to ad-hoc implementation.

## Inputs (args)

| Token | Meaning | Default |
| --- | --- | --- |
| `docs/plans/<name>.md` | Path to the approved, already-grilled Development Plan. **Required.** | — |
| `max-fix:<n>` | Override the fix-loop cap (Stages 2/3/5) for this run. | `3` |

Example: `/run-plan docs/plans/add-conventions-badge.md max-fix:2`.

## Hard rules

- **Requires an existing plan file.** Your only valid input is a path to a
  `docs/plans/<name>.md` file. If none is given, ask for one — do not guess which plan the user
  means.
- **Assumes the plan has already been through `grilling`.** You have no way to verify this
  mechanically. If the plan looks obviously unreviewed (freshly written, no evidence of edits
  after creation) and the user hasn't confirmed it was grilled, ask before proceeding.
- **Loop caps, plus no-progress detection.** Any repeat-until-clean loop (plan-verifier fix cycle,
  architecture-reviewer fix-iterate loop) is capped at **3 rounds** by default, or the
  `max-fix:<n>` value if given — but don't wait for the cap to catch a stuck loop. After each
  round, compare the unresolved finding set (same `rule` + `file:line`) to the previous round's:
  if it's unchanged, break immediately and flag it as stuck rather than spending remaining rounds
  re-attempting an identical fix. On cap-out or a stuck break, stop, summarize the remaining
  findings, and hand control back to the user instead of looping indefinitely.
- **Respect Owned paths and execution mode.** The plan's `## Execution mode` decides whether
  `implementer` tasks within a phase are dispatched in parallel (multiple `Agent` calls in one
  message) or sequentially. Never parallelize tasks whose `Owned paths` overlap, regardless of
  what the execution mode says.
- **Status routing is mandatory, not optional.** Every `implementer` return is one of
  `DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED` — handle each per the table in
  `.claude/agents/README.md` ("Status flow"). Never treat a non-`DONE` status as if it were `DONE`.
- **Report progress between stages.** After each stage, post a short status line (stage name,
  verdict, what's next) before moving on — this is a long-running flow and the user should be able
  to follow it or interrupt without reading full subagent transcripts.
- **Bring your own judgment for fix dispatches.** `architecture-reviewer` and `plan-verifier`
  findings are advisory input (their own docs say so) — you decide how to turn a finding into an
  `implementer` fix task; don't just forward raw findings unstructured.

## Stage 0 — Read the plan and summarize the run

Read the plan's `## Execution mode` and `## Phased tasks`. Before dispatching anything, post a
one-line summary of what will run — e.g. "4 tasks, multi-agent, 2 phases; fix-loop cap 3" (or the
`max-fix:<n>` override if given) — so the user can follow or interrupt without reading full
subagent transcripts.

## Stage 1 — Multi-agent implementation

For each phase, in order:

- **Multi-agent mode:** dispatch one `Agent` call per task in the phase whose `Owned paths` don't
  overlap with another task in the same dispatch batch — send all of them in a single message (per
  the parallel tool-call convention) so they run concurrently. Tasks with unresolved `Depends-on`
  wait for their dependency's `DONE` before dispatching.
- **Single-agent mode:** dispatch one `implementer` per task, sequentially, in DAG order.

Handle each return per status:

| Status | Action |
| --- | --- |
| `DONE` | Mark task complete, move on. |
| `DONE_WITH_CONCERNS` | Read the concern. Decide whether it blocks the phase or can be tracked for later (default: surface to user for anything touching security, data integrity, or public API shape; otherwise note and continue). |
| `NEEDS_CONTEXT` | Answer from the plan if possible; otherwise ask the user. Re-dispatch the same task with the missing info added. |
| `BLOCKED` | Resolve the Owned-path or protected-file conflict (adjust the task or get user sign-off to widen scope), then re-dispatch. |

A phase is complete only when every task in it reports `DONE` or an accepted `DONE_WITH_CONCERNS`.
Do not start a dependent phase early.

## Stage 2 — Plan-verifier (functional pass)

Dispatch `plan-verifier` against the plan and the full diff so far. This is the first pass — it
catches cross-task integration gaps that no single `implementer` task could see (missed wiring,
orphan contracts, a requirement silently dropped when parallel tasks merged).

- **Gate PASS** → continue to Stage 3.
- **Gate FAIL or REVIEW** → for each PARTIAL/UNVERIFIED requirement, use `plan-verifier`'s Action
  Items to build a targeted fix task (same shape as a plan task: Action, Owned paths, Acceptance)
  and dispatch `implementer` for it. Re-run `plan-verifier` scoped to just the previously-failing
  requirements (not a full re-run) to confirm the fix. Repeat up to the fix-loop cap (default 3,
  or `max-fix:<n>` if given), breaking early if a round leaves the exact same requirement(s)
  PARTIAL/UNVERIFIED as the round before (no-progress — don't retry the same fix again); on
  cap-out or a stuck break, report the remaining gaps to the user and ask whether to proceed to
  architecture review anyway or keep fixing.

## Stage 3 — Architecture review, with fix-iterate loop

Dispatch `architecture-reviewer` against the full diff. (It runs on Sonnet now, not Opus — a
deliberate cost tradeoff since this stage can loop; its rule checks are mechanical
grep-and-cite, not the kind of deep interpretive judgment that needs Opus. Watch for a quality
regression here — if it starts missing violations `plan-verifier`'s final pass would have caught,
that's a signal to move it back.)

- **Gate PASS** (0 critical, 0 high) → continue to Stage 4.
- **Gate FAIL** → this is the fix-iterate loop:
  1. Group findings by file.
  2. For each file (or small cluster of related files), build a targeted fix task from the
     finding's `rule`, `evidence`, and `recommendation` columns, and dispatch `implementer`
     (use the Minimal-path workflow when the fix is a pure import/DI/process.env change; the full
     workflow if it requires restructuring).
  3. Re-dispatch `architecture-reviewer`, passing `## Architecture context:` with the same CLAUDE.md
     summary from the first run (saves 20–30k tokens per re-run) and scope the re-audit to the
     files just touched plus anything that imports them.
  4. Repeat until Gate PASS or the fix-loop cap is hit (default 3, or `max-fix:<n>` if given). If a
     round's critical/high findings (same `rule` + `file:line`) exactly match the round before —
     no-progress — break immediately instead of spending the remaining rounds re-attempting an
     identical fix. On cap-out or a stuck break, report the outstanding critical/high findings
     verbatim to the user and stop — do not silently downgrade severities to force a PASS.

## Stage 4 — Test coverage (disabled by default)

`test-writer` is **disabled by default** as a cost-saving decision — do not dispatch it unless the
user explicitly asks for test coverage in this run. Say so explicitly in the Stage 4 status line
("Test coverage: skipped — test-writer disabled by default, ask to enable") so it isn't mistaken
for an oversight.

To re-enable for a single run: if the user asks for tests, dispatch one `test-writer` per module
bucket (`server/`, `client/`, `reviewer-core/`) that gained new logic (from the plan's
`Affected modules & contracts` plus the Stage 1/3 touched-paths lists) — these can run in parallel
since they only ever touch `*.test.ts` files, which don't overlap with `implementer`'s Owned
paths.

## Stage 5 — Plan-verifier (final gate)

Dispatch `plan-verifier` again — this is the actual merge gate. If Stage 3's last
`architecture-reviewer` run was a clean PASS, include `## Architecture review: PASS` in the prompt
so it skips re-checking layering/DI/process.env/contract-sync (saves tokens on the largest of the
two plan-verifier passes).

- **Gate PASS** → done. Report the final summary (Stage 6).
- **Gate FAIL** → same fix loop as Stage 2 (same cap, same no-progress break). If a fix here
  touches architecture (not just a missing test or wiring gap), loop back to Stage 3 for that file
  instead of just re-verifying — this is also why the `## Architecture review: PASS` skip-signal
  above is only valid until a fix round like this one touches a file it covered; don't forward the
  skip-signal on a re-run triggered by an architecture-touching fix.

## Stage 6 — Summary and next step

Report:

- Plan file path.
- Tasks completed, with any accepted `DONE_WITH_CONCERNS`.
- Architecture review: final verdict and how many fix rounds it took.
- Test coverage: skipped (default) or which modules got tests, if explicitly enabled this run.
- Plan-verifier: final gate verdict.
- **Next step:** `git push` / `gh pr create` will trigger `pr-self-review`'s hook automatically —
  no separate action needed unless the user wants to run `/pr-self-review` manually first.

## What this skill is NOT

- Not a spec or plan writer — if there's no plan file yet, stop and say so.
- Not unattended — `DONE_WITH_CONCERNS`, cap-outs, and BLOCKED tasks all route back to the user by
  design. This orchestrates the build+verify stages; it doesn't remove the human from them.
- Not a substitute for `grilling` — a plan that hasn't been grilled can still have gaps this skill
  has no way to detect (missing requirements, not missing implementation).
