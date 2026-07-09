# Workflow Insights

Process-level retrospective log for multi-agent SDD/run-plan runs — friction, near-misses,
and process recommendations. Companion to per-module `INSIGHTS.md` (codebase knowledge)
and to `docs/retros/ledger.md` (the quantitative trend row for the same runs — this file
is the qualitative "why", that file is the "how much").

> Entries are LLM-generated inference from a single run's transcript and self-reported
> `Process notes`, not independently measured ground truth — a human spot-check is
> expected, same as `INSIGHTS.md`.

## Friction Points

- 2026-07-09: `implementation-planner`'s first dispatch leg stalled mid-stream with an API-level error (`"Response stalled mid-stream"`) right before writing the plan file, surfacing as a `status: failed` task-notification — not a reasoning failure, and it recovered cleanly once resumed. (`implementation-planner`)

## What Worked Well

- 2026-07-09: Coordinator invoked `grilling` immediately on `implementation-planner`'s `**Next step:**` directive (Pattern 5, `.claude/agents/README.md:559`), and grilling's dependency-tree interview surfaced 3 unconfirmed risks (version-bump skipping, in-memory discovery cache, missing test-writer) that the plan itself hadn't flagged for confirmation, alongside the 1 it had. (`implementation-planner` → `grilling`)
- 2026-07-09: Two `researcher` subagents dispatched in one message for independent grilling questions ran concurrently (52s / 60s spans, ~6s apart) and each returned a ~250-300 word digest despite consuming 300-450K cache-read tokens internally — the coordinator's context only absorbed the digest. (`researcher` x2)

## Duplicated / Wasted Work

- 2026-07-09: `implementation-planner` had its nested `Explore` subagent map client integration points, then re-verified those findings itself before citing them in the plan — modest duplication, but a deliberate anti-hallucination check rather than wasted effort. (`implementation-planner` → `Explore`)

## Near-Misses

- 2026-07-09: A `SendMessage` resume recovered `implementation-planner` after its API-level mid-stream stall; without the resume, the ~35 minutes and tokens already spent on that dispatch would have been lost and the plan file would never have been written. (`implementation-planner`)

## Process Recommendations

- 2026-07-09: On a `failed` task-notification from an async agent, check whether the cause is a stall/API-error (as opposed to a genuine task-level failure) and attempt one `SendMessage` resume before re-dispatching from scratch — this run's resume succeeded and avoided re-incurring ~$10 and 35 minutes. (orchestrator behavior)
- 2026-07-09: Standardize future `researcher` dispatch prompts on the literal `output: compact-digest` directive from Pattern 1 (`.claude/agents/README.md:530`) instead of ad hoc "under N words" phrasing, so digest-sizing is auditable against the documented pattern. (dispatch-prompt convention)
