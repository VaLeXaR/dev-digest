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
- 2026-07-09: On a full plan rewrite triggered by a substantially revised spec, the coordinator pre-synthesized the spec diff (what changed structurally — removed DB tables, `origin` field, new tracked-status concept — and why) directly into the `implementation-planner` dispatch prompt instead of leaving the planner to re-derive it from a raw `git diff`. The planner's own Process note confirmed the effect: "the rewrite brief pre-supplied the spec-diff context, so verification was fast." (coordinator → `implementation-planner`)

## Duplicated / Wasted Work

- 2026-07-09: `implementation-planner` had its nested `Explore` subagent map client integration points, then re-verified those findings itself before citing them in the plan — modest duplication, but a deliberate anti-hallucination check rather than wasted effort. (`implementation-planner` → `Explore`)

## Near-Misses

- 2026-07-09: A `SendMessage` resume recovered `implementation-planner` after its API-level mid-stream stall; without the resume, the ~35 minutes and tokens already spent on that dispatch would have been lost and the plan file would never have been written. (`implementation-planner`)
- 2026-07-09: In a follow-up `grilling` pass on a rewritten plan, the coordinator answered 2 codebase-evidence questions (checking for a Redis dependency; checking `simple-git.ts` for an existing per-clone lock) via direct `Grep`/`Read`/`Bash` calls instead of dispatching `researcher` subagent(s), contrary to `grilling`'s own `SKILL.md` instruction ("dispatch a researcher subagent via Agent rather than reading files directly yourself") and a regression from the prior run's logged good pattern (2 parallel `researcher` dispatches for grilling questions, see What Worked Well above). No harm this time — both checks were single-fact lookups answered correctly — but the pattern would degrade on a larger/more ambiguous evidence question. (coordinator → `grilling`)

## Process Recommendations

- 2026-07-09: On a `failed` task-notification from an async agent, check whether the cause is a stall/API-error (as opposed to a genuine task-level failure) and attempt one `SendMessage` resume before re-dispatching from scratch — this run's resume succeeded and avoided re-incurring ~$10 and 35 minutes. (orchestrator behavior)
- 2026-07-09: Standardize future `researcher` dispatch prompts on the literal `output: compact-digest` directive from Pattern 1 (`.claude/agents/README.md:530`) instead of ad hoc "under N words" phrasing, so digest-sizing is auditable against the documented pattern. (dispatch-prompt convention)
- 2026-07-09: During `grilling`, dispatch `researcher` subagent(s) for codebase-evidence questions per the skill's own instruction rather than defaulting to direct `Grep`/`Read`/`Bash` — the skill currently has no proportionality carve-out for a trivial single-fact check, so either follow it consistently or propose (as a separate, explicitly-approved change) adding an explicit threshold to `grilling/SKILL.md` for when a direct check is acceptable. (`grilling` skill adherence)
- 2026-07-09: After `implementation-planner` returns a `**Next step:**` directive naming a mandatory handoff (e.g. run `grilling`), invoke it immediately rather than pausing to ask the requester for permission — `CLAUDE.md`'s "Mandatory handoffs — do not skip, even mid-conversation" already pre-authorizes the action; asking first only adds an avoidable round-trip for something that isn't actually discretionary. (orchestrator behavior)
