---
name: spec-clarification
description: Interview the requester about every open question in a draft SPEC-<DATE> file — [NEEDS CLARIFICATION] markers and design gaps found during authoring — one at a time, until the spec is unambiguous. Use after spec-creator hands off a spec, or when the user wants to stress-test a spec before it moves to implementation-planner.
---

Interview the requester about the SPEC-<DATE> file named in the handoff, one question at a time,
until every open item is resolved or explicitly deferred.

## Before interviewing

Read `INSIGHTS.md` for the spec's affected module(s) only — not every module's, project-wide.
Infer which ones from the spec's location and content: a `<module>/specs/` file means that one
module; a root `specs/` file means every module named in its `Architecture & contracts` or
`Inputs (provenance)` sections. Fold relevant gotchas into your recommended answers instead of
guessing at them.

## What counts as an open item

- Every `[NEEDS CLARIFICATION: ...]` marker in the spec.
- Every gap spec-creator's design audit or `Architecture & contracts` drafting flagged but did
  not resolve (missing edge case, unclear cross-module interaction, ambiguous contract shape, UX
  improvement suggestion left unconfirmed).
- Any Acceptance criterion whose EARS trigger/state/reaction is still vague enough that two
  readers could implement it differently.
- Any `Non-functional` claim still written as a vague verb/term rather than a number or concrete
  constraint — same ban-list spec-creator uses: appropriate / reasonable / user-friendly /
  quickly / efficiently / robust.

Work through them in the order they appear in the file, top to bottom. Do not jump ahead or
batch several into one message — asking multiple questions at once is bewildering.

## For each question

1. State the open item in one sentence — quote the marker or describe the gap.
2. Give your own recommended answer, with the reasoning in one line.
   - Evidence-gathering — internal (confirming a claim against the codebase or an existing spec) or
     external (a standard, a library API, a convention) — goes through the `researcher` agent via
     `Agent`, not serial `Read`/`Grep`/`WebSearch` calls of your own. When more than one open item
     needs independent evidence, dispatch several `researcher` subagents in parallel rather than
     one after another, whether the questions are internal, external, or a mix — this is what makes
     resolving a large batch of open items fast instead of a bottleneck.
   - A quick single-file confirmation you can do faster yourself than by round-tripping through a
     subagent (e.g. re-reading a file you already have open) doesn't need `researcher` — use
     judgment; the rule is against serial fact-finding across *multiple* independent items, not
     against ever touching `Read`/`Grep` directly.
   - Only ask the requester if it's still ambiguous after looking/researching.
3. Wait for the requester's response before moving to the next item.
4. As soon as an item is resolved, edit the spec file immediately (`Edit`, never `Write` — the
   file already exists and other sections must survive untouched):
   - Remove the `[NEEDS CLARIFICATION: ...]` marker.
   - Fold the answer into the right section — `Goals / Non-goals`, `Edge cases`,
     `Acceptance criteria (EARS)`, etc. A resolved AC-affecting answer must be written as a
     proper EARS statement (Ubiquitous / Event-driven / State-driven / Unwanted behavior /
     Optional feature), not as freeform prose.
   - A newly-confirmed AC gets the next free `AC-N` appended at the end of
     `Acceptance criteria (EARS)` — never renumber or reuse an existing `AC-N`, even one for an
     item you're about to replace.
   - If the requester explicitly declines to resolve an item now, replace the marker with a
     one-line note under a `## Deferred` subsection instead of deleting the concern — do not
     silently drop it.

## Scope limits

- You may only edit the one `SPEC-<DATE>` file named in the handoff, and only while its
  `Status:` is `draft`. If the file's status is `approved` or `implemented`, stop and say so —
  do not edit it; a new superseding spec is required instead (that's `spec-creator`'s job, not
  this skill's).
- Never touch product code, `docs/plans/`, or any file outside the one spec you were handed.

## Final self-check (before proposing Status → approved)

Before asking the requester to approve, verify:

- [ ] No `[NEEDS CLARIFICATION]` markers remain (or are explicitly moved to `## Deferred`)
- [ ] Every `AC-N` is still a valid, single-pattern EARS statement — no duplicates or
      contradictions introduced by your edits
- [ ] `## Success criteria (measurable)` still states a number/rate/threshold (or explicit `N/A`)
      consistent with the (possibly changed) ACs
- [ ] `## Non-functional` has no leftover vague terms from the ban-list
- [ ] Every `[reused: ...]` / `[deterministic: ...]` tag you touched still cites a `file:line`
      confirmed this session — either you opened it yourself, or a `researcher` subagent you
      dispatched this session opened it and reported the exact citation back; a tag that looked
      right before your edits doesn't count as reverified
- [ ] `## Untrusted inputs` still accurately reflects the feature's (possibly updated) scope

## Closing the loop

When the self-check above is clean and every design-audit gap is either resolved or moved to
`## Deferred`, summarise what changed and ask the requester whether to flip `Status: draft` →
`approved`. Only make that edit if they explicitly confirm — never flip status on their behalf.
