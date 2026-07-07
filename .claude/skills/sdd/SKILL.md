---
name: sdd
description: "Orchestrates the full Spec-Driven Development pipeline end to end: spec-creator → spec-clarification → implementation-planner → grilling → multi-agent implementer → plan-verifier → architecture-reviewer (with fix-iterate loop) → final plan-verifier gate. Accepts a spec file, a freeform requirements prompt, and/or design references (images/Figma) as input. Use via /sdd when the user wants a feature built through the full SDD workflow instead of dispatching each agent by hand. For an already-approved, already-grilled plan, use /run-plan instead — it skips the spec/planning stages."
user-invocable: true
version: "1.1.0"
---

# SDD — Spec-Driven Development orchestrator

You are the **coordinator** for the full pipeline documented in `AGENTS.md`'s
"Spec-Driven Development pipeline" section:

```
spec-creator → [spec-clarification] → implementation-planner → [grilling]
   → implementer ×N (multi-agent or single-agent, per plan)
   → plan-verifier (functional pass)
   → architecture-reviewer  ⇄  fix-iterate loop
   → [test-writer — disabled by default, see Stage 7]
   → plan-verifier (final gate)
   → pr-self-review (hook-enforced on git push — not this skill's job)
```

This skill contains no review knowledge of its own — every quality judgment is delegated to the
named agent or skill. Your job is sequencing, argument routing, status handling, and the fix-iterate
loops around `plan-verifier` and `architecture-reviewer`.

**Already have an approved, grilled plan and just want to build it?** Use `/run-plan` instead — it
starts at Stage 4 below and skips spec/planning entirely.

## Hard rules

- **Never skip a human touchpoint.** `spec-clarification` and `grilling` are interactive skills
  that run in *this* conversation, not subagents — they must actually interview the user, not be
  silently marked done. Do not proceed past them without the user's explicit approval
  (`Status: draft → approved` for the spec; plan gaps resolved for `grilling`).
- **Loop caps.** Any repeat-until-clean loop (plan-verifier fix cycle, architecture-reviewer
  fix-iterate loop) is capped at **3 rounds**. On the 3rd failure, stop, summarize the remaining
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

## Step 0 — Determine entry point

Inspect what the user passed to `/sdd`. It may be any combination of:

| Input | How to recognize | Effect |
| --- | --- | --- |
| Path to an existing `SPEC-<DATE>-*.md` | Argument matches a file under `specs/` or `<module>/specs/` | Read it. Its `Status:` header decides the entry point (see below). |
| Path to an existing `docs/plans/<name>.md` | Argument matches a plan file | Skip straight to Stage 4 — same as `/run-plan`. |
| Freeform requirements prompt | Plain text describing a feature, no spec path | Entry: **Spec creation**. |
| Design references | Local image path(s), a Figma/external URL, or "see attached mockup" | Pass through as-is to whichever stage runs first (spec-creator if creating a spec, implementation-planner's Design audit if a spec already exists and covers requirements but not visuals). |
| Nothing | `/sdd` with no arguments | Ask the user directly, in this conversation, for a one-paragraph feature description before doing anything else. Do not dispatch `spec-creator` on an empty prompt. |

**Entry point by spec status:**

- No spec given → **Entry: Spec creation** (Stage 1a).
- Spec given, `Status: draft` → **Entry: Spec clarification** (Stage 1b) — skip spec-creator.
- Spec given, `Status: approved` or `implemented` → **Entry: Planning** (Stage 2) — skip both
  spec-creator and spec-clarification.

If design references are supplied alongside an *already-approved* spec that doesn't mention them,
say so and ask the user: amend via a new spec (spec-creator, `Supersedes:`) or treat the designs as
planner-only input for the Design audit. Don't guess.

## Stage 1a — Spec creation

Dispatch the `spec-creator` agent (via `Agent`) with the requirements prompt and any design
references. Wait for it to return a spec file path.

## Stage 1b — Spec clarification

Invoke the `spec-clarification` skill on the spec file (freshly written or user-supplied draft).
This is interactive — it interviews the user one question at a time in this conversation. Do not
proceed until its Final self-check is clean and the user has explicitly confirmed
`Status: draft → approved`.

## Stage 2 — Planning

Dispatch the `implementation-planner` agent with the approved spec (or, if no spec exists and the
user explicitly declined one, the raw requirements prompt — note this is a deviation from full SDD
and confirm the user actually wants to skip the spec stage before doing it).

The planner may return either a written plan file, or a request for clarification (ambiguous scope,
missing execution-mode confirmation, UI work with no design ground truth). If it returns questions
instead of a plan:

1. Relay them to the user (use `AskUserQuestion` when they're genuinely discrete choices).
2. Re-dispatch `implementation-planner` with the answers appended to the original prompt.
3. Repeat until a plan file is returned.

## Stage 3 — Grilling

Invoke the `grilling` skill on the plan file, per the planner's own `Next step:` directive. This is
interactive, same as spec-clarification. Do not dispatch any `implementer` until grilling is done
and any plan edits it produced are final.

## Stage 4 — Multi-agent implementation

Read the plan's `## Execution mode` and `## Phased tasks`.

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
| `NEEDS_CONTEXT` | Answer from the plan/spec if possible; otherwise ask the user. Re-dispatch the same task with the missing info added. |
| `BLOCKED` | Resolve the Owned-path or protected-file conflict (adjust the task or get user sign-off to widen scope), then re-dispatch. |

A phase is complete only when every task in it reports `DONE` or an accepted `DONE_WITH_CONCERNS`.
Do not start a dependent phase early.

## Stage 5 — Plan-verifier (functional pass)

Dispatch `plan-verifier` against the plan and the full diff so far. This is the first pass — it
catches cross-task integration gaps that no single `implementer` task could see (missed wiring,
orphan contracts, a requirement silently dropped when parallel tasks merged).

- **Gate PASS** → continue to Stage 6.
- **Gate FAIL or REVIEW** → for each PARTIAL/UNVERIFIED requirement, use `plan-verifier`'s Action
  Items to build a targeted fix task (same shape as a plan task: Action, Owned paths, Acceptance)
  and dispatch `implementer` for it. Re-run `plan-verifier` scoped to just the previously-failing
  requirements (not a full re-run) to confirm the fix. Repeat up to the 3-round cap; on cap-out,
  report the remaining gaps to the user and ask whether to proceed to architecture review anyway or
  keep fixing.

## Stage 6 — Architecture review, with fix-iterate loop

Dispatch `architecture-reviewer` against the full diff. (It runs on Sonnet, not Opus — a
deliberate cost tradeoff since this stage can loop; its rule checks are mechanical grep-and-cite,
not the kind of deep interpretive judgment that needs Opus.)

- **Gate PASS** (0 critical, 0 high) → continue to Stage 7.
- **Gate FAIL** → this is the loop the user specifically asked for:
  1. Group findings by file.
  2. For each file (or small cluster of related files), build a targeted fix task from the
     finding's `rule`, `evidence`, and `recommendation` columns, and dispatch `implementer`
     (use the Minimal-path workflow when the fix is a pure import/DI/process.env change; the full
     workflow if it requires restructuring).
  3. Re-dispatch `architecture-reviewer`, passing `## Architecture context:` with the same CLAUDE.md
     summary from the first run (saves 20–30k tokens per re-run) and scope the re-audit to the
     files just touched plus anything that imports them.
  4. Repeat until Gate PASS or the 3-round cap is hit. On cap-out, report the outstanding
     critical/high findings verbatim to the user and stop — do not silently downgrade severities to
     force a PASS.

## Stage 7 — Test coverage (disabled by default)

`test-writer` is **disabled by default** as a cost-saving decision — do not dispatch it unless the
user explicitly asks for test coverage in this run. Say so explicitly in the Stage 7 status line
("Test coverage: skipped — test-writer disabled by default, ask to enable") so it isn't mistaken
for an oversight.

To re-enable for a single run: if the user asks for tests, dispatch one `test-writer` per module
bucket (`server/`, `client/`, `reviewer-core/`) that gained new logic (from the plan's
`Affected modules & contracts` plus the Stage 4/6 touched-paths lists) — these can run in parallel
since they only ever touch `*.test.ts` files, which don't overlap with `implementer`'s Owned
paths.

## Stage 8 — Plan-verifier (final gate)

Dispatch `plan-verifier` again — this is the actual merge gate. If Stage 6's last
`architecture-reviewer` run was a clean PASS, include `## Architecture review: PASS` in the prompt
so it skips re-checking layering/DI/process.env/contract-sync (Pattern 3).

- **Gate PASS** → done. Report the final summary (Stage 9).
- **Gate FAIL** → same fix loop as Stage 5, capped at 3 rounds. If a fix here touches architecture
  (not just a missing test or wiring gap), loop back to Stage 6 for that file instead of just
  re-verifying.

## Stage 9 — Summary and next step

Report:

- Spec file (if any) and its final status.
- Plan file path.
- Tasks completed, with any accepted `DONE_WITH_CONCERNS`.
- Architecture review: final verdict and how many fix rounds it took.
- Test coverage: skipped (default) or which modules got tests, if explicitly enabled this run.
- Plan-verifier: final gate verdict.
- **Next step:** `git push` / `gh pr create` will trigger `pr-self-review`'s hook automatically —
  no separate action needed unless the user wants to run `/pr-self-review` manually first.

## What this skill is NOT

- Not a replacement for reading the plan or spec yourself — you still need to understand what's
  being built to route clarifications and fix-task dispatches sensibly.
- Not a way to bypass `spec-clarification` or `grilling` — those are the only human checkpoints
  before code gets written; skipping them defeats the purpose of doing SDD at all.
- Not unattended — `DONE_WITH_CONCERNS`, cap-outs, and ambiguous planner questions all route back
  to the user by design. This orchestrates the pipeline; it doesn't remove the human from it.
