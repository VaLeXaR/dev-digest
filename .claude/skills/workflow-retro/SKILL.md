---
name: workflow-retro
description: >
  Manual, on-demand only — never auto-invoked by /sdd, /run-plan, or any other
  skill/agent. Run AFTER a multi-agent workflow finishes (/sdd, /run-plan, or any
  hand-dispatched batch of sub-agents) to produce a retrospective: dispatch order,
  cost/resource metrics (tokens including nested sub-agents, cache efficiency, tool
  calls, durations, parallelism), process/effectiveness signals (clarifying
  round-trips, fix-loop rounds, delegation correctness), and qualitative findings
  (what was hard, what was easy, what was duplicated, what was missed) — then turns
  them into typed, actionable recommendations. Appends one trend row to
  docs/retros/ledger.md and dated narrative entries to .claude/agents/WORKFLOW-INSIGHTS.md.
  Use via /workflow-retro (args: label:<slug>, deep, session:<id>, scope:last|session,
  no-ledger), or when the user explicitly asks to review/evaluate how a workflow run went.
user-invocable: true
version: "2.0.0"
---

# Workflow Retro — retrospective for a multi-agent run

> Hand me a finished multi-agent run and I tell you what it cost, where it struggled,
> what it wasted, and exactly what to change next time — then log a trend row so runs
> can be compared over time.

You are the **analyst**, running in the main session. The workflow already ran; your job
is to look back at it, not re-run it. You read metrics and reports, reason about them,
and produce a report plus recommendations. **You never edit an agent/skill definition or
product code as part of this skill** — you *recommend* changes; applying one is a
separate, explicitly-approved follow-up.

This is the process-level twin of `engineering-insights`: that skill captures what was
learned about the *codebase*; this one captures what was learned about the *pipeline
that built the change* — cost, dispatch order, loop rounds, duplicated work, near-misses.

## Manual only — never automatic

Unlike `spec-clarification`/`grilling` (mandatory handoffs `sdd`/`run-plan` must act on
immediately), this skill is opt-in every time, with **no hook and no auto-trigger**:
never wired to a `Stop`/`SubagentStop`/`PreToolUse` event, never chained at the tail of
another skill or workflow, never registered in `settings.json`. `sdd` and `run-plan` may
*mention* it's available in their final summary — they must not invoke it themselves.
Only run this when the user explicitly asks or types `/workflow-retro`. If you ever see
it auto-triggering, that is a bug: stop and tell the user.

## Count nested sub-agents — do not undercount

A dispatched agent can spawn **its own** sub-agents: `spec-creator`, `implementation-planner`,
`doc-writer`, `implementer`, and `plan-verifier` all carry the `Agent` tool and may fan
out `researcher` (or `Explore`) calls internally (per the parallel-research rules in their
own definitions). This is the single most important correctness rule in this skill:

- **A parent's in-context `<usage>` block reports only its own tokens, never its
  children's.** Reading only the top-level `Agent` result for a run that used a
  spawning agent silently **undercounts** the true cost — sometimes severely (nested
  `researcher` fan-outs commonly run 20k–40k tokens each; see the worked numbers in
  `## Data sources` below).
- **The fix is the standard parent-child span-tree rollup** used by OpenTelemetry GenAI
  conventions, LangSmith, and Braintrust for multi-agent cost attribution: nested agents
  must be summed into the parent's total, not read in isolation. This skill's `deep`
  mode does exactly that via `spawnDepth` in each journal's sibling `.meta.json`.
- **Rule:** whenever the run dispatched an agent that can itself spawn sub-agents — or
  you are not sure whether it did — prefer `deep` mode, or at minimum state explicitly
  in the report that in-context totals exclude nested agents and may be an undercount.

## Inputs (args)

| Token | Meaning | Default |
|---|---|---|
| `label:<slug>` | Name for this retro (the run under review). | derived from the run / date |
| `deep` | Parse on-disk JSONL journals for exact token/cache/tool/timing data, including nested sub-agents. | off (in-context metrics only) |
| `session:<id>` | Which session transcript to analyse in `deep` mode. | the current session |
| `scope:last` \| `scope:session` | Review just the most recent agent batch, or every agent dispatched this session. | `last` |
| `no-ledger` | Print the report only; do not append a ledger row. | off (ledger row is written) |

If it's ambiguous *which* run to review (several distinct batches in one session), ask
before analysing — do not silently pick.

## Data sources (both are real; prefer the cheap one, escalate when it matters)

1. **In-context (default).** As orchestrator you saw every `Agent` result's `<usage>`
   block (`subagent_tokens`, `tool_uses`, `duration_ms`), every notification, the launch
   order, which agents ran in the same message (parallel), and each agent's final
   report — including its `### Process notes` / `**Process note:**` field if present
   (see `## What to measure`). Zero file reads, but **excludes nested sub-agent cost**
   (see previous section) and has no cache-read/cache-write split.

2. **Deep (the `deep` flag).** Parse the JSONL journals for exact, per-turn numbers,
   including every nesting level:
   - Subagent journals: `<session-dir>/subagents/agent-*.jsonl`, each with a sibling
     `agent-*.meta.json` carrying `agentType` + `spawnDepth`.
   - Main session transcript: `<session-dir>.jsonl` (sibling of the session directory).
   - **Locate `<session-dir>` first — the path differs by OS:**
     - macOS/Linux: `~/.claude/projects/<project-slug>/<session-id>/`
     - Windows: `%USERPROFILE%\.claude\projects\<project-slug>\<session-id>\` — on this
       machine, resolves under `C:\Users\<user>\.claude\projects\<project-slug>\`.
     - Find `<project-slug>` and `<session-id>` from the current session's own working
       paths (visible in your environment info) or by finding the most-recently-modified
       `*.jsonl` under `~/.claude/projects/<project-slug>/` (or its Windows equivalent).
   - Run the bundled analyzer (**Node, not Python** — this repo guarantees Node ≥22
     per root `CLAUDE.md`; Python is not guaranteed and may not be installed at all):
     ```
     node .claude/skills/workflow-retro/scripts/analyze-journals.cjs \
       "<session-dir>/subagents/agent-*.jsonl" --json
     ```
   - **On Windows, invoke this via the `PowerShell` tool with a native `C:\Users\...`
     path, not the `Bash` tool with a git-bash `/c/...` path.** Node on Windows resolves
     a `/c/...`-style argument as a relative path against the *current* drive's root, not
     `C:\...` — the script then fails silently with `no readable journal files matched`
     and no further diagnostic (confirmed 2026-07-12). If that error appears, re-run the
     same command through `PowerShell` with a `C:\Users\...`-style path before assuming
     the journals don't exist.
   - It prints per-agent and total tokens, **two cache-ratio figures** (`read_ratio` =
     cache-read ÷ all input-side tokens, the headline "cache hit %" this skill quotes;
     `hit_rate` = cache-read ÷ (cache-read + cache-write), a secondary "is caching
     working mechanically" figure — these answer different questions, don't conflate
     them), tool-call counts, wall-clock span, a **parallelism factor**
     (Σ agent spans ÷ wall-clock), and the **critical-path agent** (the single longest
     span). Nested sub-agents (`spawnDepth > 1`) are indented under their parent and
     **included in every total** (`nested_agents=` / `max_depth=` in the summary line).
   - For a cost estimate pass `--prices prices.json` (map of
     `{model_substring: {in, out, cache_read, cache_write}}` in $/Mtok) — **do not
     hard-code prices, confirm current per-model rates via the `claude-api` skill
     first**, since they drift. Without `--prices`, cost prints `n/a`.
   - If neither `node` (unlikely — required by this repo) nor the expected journal
     directory exists, say so plainly and fall back to the in-context view — a clear
     "journals not found, here's the in-context view" is a valid result, a fabricated
     metric is not.

## What to measure

Collect what you can; mark anything unavailable as `n/a` rather than guessing.

**Cost & resources (quantitative)**
- Tokens — input / output / cache-read / cache-creation, **per agent and total**,
  **including nested sub-agents** (state explicitly if this run's totals are
  in-context-only and therefore an undercount).
- `read_ratio` (headline) and `hit_rate` (secondary) — see Data sources above. A low
  `read_ratio` is a concrete cost lever: check whether a dynamic block (a timestamp, the
  diff, PR-specific text) was injected *before* a stable prefix (system prompt, skill
  bodies) instead of after it — reordering static-first/dynamic-last is the standard fix.
- Tool calls per agent and total.
- Wall-clock per agent and total; **parallelism factor** = Σ(agent spans) ÷ wall-clock.
- **Critical path** — in `deep` mode, the single longest-span dispatch. For a phased
  `sdd`/`run-plan` run, also name the **DAG critical path**: the longest chain of
  `Depends-on`-linked tasks across phases, which can differ from the single longest
  individual dispatch and is usually the more actionable latency lever.
- Cost ($) per agent and total (only with verified `--prices`), plus **cost per useful
  output** ($/finding, $/spec, $/fixed-task) — a better signal than raw spend.

**Process & effectiveness**
- Agent count **including nested sub-agents** (report as "N agents: M top-level + K
  nested"), launch order, and the parallelism map (concurrent vs serial, every depth).
- **Clarifying round-trips** per agent — how often it was re-prompted or corrected. High
  = the dispatch brief was underspecified (a concrete, fixable cause, not just "friction").
- Rework — fix-loop iterations (`sdd`/`run-plan`'s capped loops), retries, re-spawns; note
  any loop that hit its cap or a no-progress break, and whether the same `rule`+`file:line`
  recurred unchanged across rounds (a signal the fix-task description, not the code, was
  the problem).
- Delegation correctness — did the right agent type take each task; did agents stay in
  their owned paths / scope (scope drift).
- **Failure taxonomy** — classify each non-success return, not as a flat "it failed":
  - *Intra-agent* (the agent's own reasoning/planning/action/memory): looped, stalled,
    misread its own task.
  - *Inter-agent* (coordination): redundant/duplicated work across agents, an unclear
    task boundary, a premature termination, an agent misconfigured for its role.
  - *Escalation* (this repo's status enum): `BLOCKED`, `NEEDS_CONTEXT`, a fix-loop
    cap-out, a gate `FAIL`.
  Recurring instances of the same category across a run (or across several retro'd runs)
  are the highest-value finding — a pattern, not a one-off.
- **Chaining-pattern adherence.** Cross-reference `.claude/agents/README.md`'s six
  token-efficient chaining patterns against what actually happened: was a `researcher`
  digest passed to `implementation-planner`? Did a clean `architecture-reviewer` PASS
  get forwarded to `plan-verifier` as `## Architecture review: PASS`? Was
  `## Architecture context:` reused on a fix-loop re-run? Every applicable pattern that
  was **available but not used** is a concrete, named finding — cite the pattern by
  number and estimate the token cost of skipping it (the README states each pattern's
  typical savings).

**Qualitative insights**
- **Read each agent's own `### Process notes` / `**Process note:**` field first** —
  `implementer`, `plan-verifier`, `architecture-reviewer`, `spec-creator`, and
  `implementation-planner` all end their reply with this optional field. It is
  first-hand signal from the agent that did the work, not your inference — treat it as
  higher-confidence than anything you derive from the transcript. Only fall back to
  inferring (re-dispatches, `BLOCKED`/`NEEDS_CONTEXT` returns, a fix-loop repeating the
  same finding) for dispatches that omitted the field, or where the coordinator caught
  something a self-check should have but didn't report — that gap is itself a near-miss
  finding.
- **What was hard** — where agents stalled, looped, or asked questions.
- **What was easy** — what went cleanly first try (don't only log failure — this is
  what confirms a chaining pattern or a well-scoped brief is worth repeating).
- **Duplicated information** — the same large file read by multiple agents, the same
  context re-sent, overlapping work — candidates for a single shared pre-read or an
  unused chaining pattern (see above).
- **What was missed** — gaps the orchestrator or the human caught only afterwards; the
  highest-value section, same role as `engineering-insights`' "What Doesn't Work".

## Method

1. **Scope the run.** Resolve `scope:last`/`scope:session` (or ask if genuinely
   ambiguous). List the dispatched agents with their roles.
2. **Collect metrics.** In-context by default; if `deep`, locate the journals (see Data
   sources) and run `analyze-journals.cjs`. Build the per-agent table + totals,
   including nested sub-agents.
3. **Read Process notes first**, then analyse the remaining dimensions (see above),
   separating *quantitative* findings (from the table) from *qualitative* ones (from
   reports, Process notes, and your own observation).
4. **Recommend.** Turn each finding into a typed, owned action (see *Recommendation
   taxonomy*) — never a vague "could be more efficient": name the agent, the file, or
   the parameter, and the expected effect.
5. **Dedup check** (mandatory, mirrors `engineering-insights`): re-read
   `.claude/agents/WORKFLOW-INSIGHTS.md` immediately before writing. Skip any finding
   already present in equivalent form.
6. **Output** the report (below) to chat. Unless `no-ledger`: append one row to
   `docs/retros/ledger.md` (create with a header if missing) **and** append the dated
   narrative findings (Friction, What Worked Well, Duplicated/Wasted, Near-Misses,
   Process Recommendations) to `.claude/agents/WORKFLOW-INSIGHTS.md` — these are
   deliberately two different files (see `## File and format` for why).
7. **Ask the user for their own read** (one question, optional to skip): anything from
   their side that felt slow, wrong, redundant, or surprising the transcript alone
   wouldn't show? Fold their answer in verbatim-attributed, don't paraphrase away
   specifics.
8. **Offer, but do not perform**, the follow-up: "want me to apply recommendation X?"
   Applying it (editing an agent prompt, a skill, the orchestration) is a separate,
   explicitly-approved step.

## Recommendation taxonomy — make findings actionable, not vague

Every recommendation gets a `Type`, mirroring the SRE-postmortem convention of a typed
Action Items table instead of prose:

| Type | When to use | Example shape |
|---|---|---|
| `brief-context` | A dispatch brief lacked context another agent already had, causing a clarifying round-trip. | "`implementer` T-3 needed 2 round-trips on owned paths — add sibling tasks' owned paths to its brief." |
| `effort-scaling` | An agent over- or under-invested relative to the task's complexity class. | "`researcher` made 1 tool call for a multi-source question — brief should ask for ≥3 query variations." |
| `concurrency` | Independent work ran serially, or dependent/shared-state work ran in parallel (the latter is a bug, not an optimization — verify independence before recommending parallel). | "review agents ran serially but have disjoint inputs — dispatch in one message." |
| `merge-split` | Two agents always run back-to-back on the same files (merge candidate), or one agent did two unrelated jobs (split candidate). | "agents A and B always chain on the same file — consider merging." |
| `caching` | Low `read_ratio`/`hit_rate`, or a chaining pattern (digest/context handoff) was skipped. | "cache read_ratio 38% — a per-request timestamp sits before the stable prefix; move it after." |
| `output-contract` | An agent returned more than the orchestrator needed (a transcript instead of a summary), bloating downstream context. | "`researcher` X returned full per-source detail when only the digest was needed — request `output: compact-digest`." |
| `process` | A gap in orchestration itself (a missing loop-cap check, an unclear stage boundary) rather than any single agent. | "fix-loop hit the cap without a stuck-break firing — the no-progress check missed a `rule`+`file:line` match." |

Each recommendation names the target (agent/skill/file/parameter) and the expected
effect (fewer round-trips, N tokens saved, wall-clock reduced) — never bare prose.

## Output format (report to chat)

```
## Workflow Retro — <label>

**Run:** <what ran> · <N> agents (M top-level + K nested) · mode <multi|single> · data: <in-context | deep>

### Metrics
| agent | role | depth | in | out | cache-read | read% | tools | span | cost |
|-------|------|-------|----|----|-----------|-------|-------|------|------|
| …     | …    | …     | …  | …  | …         | …     | …     | …    | …    |
**Totals:** in <…> · out <…> · read_ratio <…>% · hit_rate <…>% · tools <…> · wall <…>s · parallelism <…>x · cost <…>
**Launch order:** A → (B ∥ C) → D     **Critical path (single dispatch):** <agent> (<…>s)
**DAG critical path (if phased):** <task chain> (<…>s)

### What went well
- <…>

### What was hard / wasteful
- <difficulty / stall> — <evidence, cite Process notes if available>
- <duplicated context / skipped chaining pattern> — <which agents, which Pattern #, ~tokens>
- <what was missed> — <caught when / by whom>

### Failure taxonomy
| category | instance | evidence |
|---|---|---|
| intra-agent / inter-agent / escalation | … | … |

### Recommendations (typed, actionable)
| Type | Target | Change | Expected effect |
|------|--------|--------|------------------|
| …    | …      | …      | …                |

### Written
- `docs/retros/ledger.md` — 1 row appended (skipped: `no-ledger`)
- `.claude/agents/WORKFLOW-INSIGHTS.md` — N narrative entries appended
```

## File and format

Two files, deliberately separate — this is a course-correction from an earlier version
of this skill that merged them: the trend ledger needs to be scannable/diffable as pure
data (one immutable row per run), while narrative findings need prose and grow at a
different rate. Merging them made both worse.

### `docs/retros/ledger.md` — cross-run trend (create with this header if missing)

```markdown
# Retro Ledger

One row per `/workflow-retro` run. Append-only — this is the trend source, don't hand-edit
past rows. **Regression thresholds** (flag in the retro report, don't just log silently):
cost or token total up >20% week-over-week for a comparable workflow type, or fix-loop
rounds trending upward across 3+ consecutive runs of the same kind.

| date | label | workflow | agents (top/nested) | in→out tok | read_ratio | wall | parallelism | cost | fix-loop rounds (arch/plan) | top recommendation |
|------|-------|----------|----------------------|-----------|-----------|------|-------------|------|------------------------------|---------------------|
```

### `.claude/agents/WORKFLOW-INSIGHTS.md` — narrative findings (create with this header if missing)

```markdown
# Workflow Insights

Process-level retrospective log for multi-agent SDD/run-plan runs — friction, near-misses,
and process recommendations. Companion to per-module `INSIGHTS.md` (codebase knowledge)
and to `docs/retros/ledger.md` (the quantitative trend row for the same runs — this file
is the qualitative "why", that file is the "how much").

> Entries are LLM-generated inference from a single run's transcript and self-reported
> `Process notes`, not independently measured ground truth — a human spot-check is
> expected, same as `INSIGHTS.md`.

## Friction Points
## What Worked Well
## Duplicated / Wasted Work
## Near-Misses
## Process Recommendations
```

Entry format (same bar as `engineering-insights`): **"Would this be obvious to anyone
reading the run's final summary?"** If yes, skip it.

```markdown
- YYYY-MM-DD: [Specific, actionable finding in one sentence] (`agent-or-stage-name`)
```

"The workflow used several agents" is noise. "`architecture-reviewer` hit the 3-round fix
cap on `Rule 4 — DI discipline` in `server/src/modules/foo/service.ts` — the same finding
recurred unchanged in rounds 2 and 3, meaning the fix task wasn't specific enough about
*which* line to change" is signal.

## Non-Destructive Write Contract (hard rule, both files)

Identical discipline to `engineering-insights` — both files are read by many future runs
and a `Write` call would destroy that history:

- **Never use `Write` on an existing ledger or insights file.**
- **Re-read the target file immediately before writing** — it may have changed since you
  started.
- **Insert with an anchored `Edit`** — a new row at the end of the ledger table; a new
  bullet under the correct `##` heading in `WORKFLOW-INSIGHTS.md`.
- **Append-only.** Corrections are new dated entries/rows that supersede an old one;
  never delete or rewrite a past one. Human maintenance (monthly, same cadence as
  `INSIGHTS.md`) can prune stale entries.
- **Idempotent** — skip anything equivalent to an entry already present (Method step 5).
- **Size limit** — if `WORKFLOW-INSIGHTS.md`'s sections approach ~100 entries combined,
  or the ledger approaches ~100 rows, flag it in `Process Recommendations` for a split
  (e.g. by quarter) — signal-to-noise degrades past this point.

## File structure

```
workflow-retro/
├── SKILL.md                        — this file: scope → collect → analyse → recommend → report
└── scripts/
    └── analyze-journals.cjs        — read-only, zero-dependency Node script for `deep` mode
                                       (Node, not Python — this repo guarantees Node ≥22;
                                       Python is not guaranteed and was absent on the
                                       machine this skill was authored/tested on)
```

## Relationship to other skills

- `sdd` / `run-plan` **build** a feature. `workflow-retro` looks **back** at how that run
  (or any multi-agent run) performed — never invoked automatically by either.
- `engineering-insights` captures durable per-module technical discoveries in
  `<module>/INSIGHTS.md`. `workflow-retro` is about the **run/process**, not the code;
  its durable output is `docs/retros/ledger.md` (quantitative trend) plus
  `.claude/agents/WORKFLOW-INSIGHTS.md` (qualitative narrative).
- `implementer`, `plan-verifier`, `architecture-reviewer`, `spec-creator`, and
  `implementation-planner` each carry an optional `### Process notes` field in their
  output specifically to feed this skill first-hand signal — read those before
  inferring anything from the raw transcript.

## When you cannot proceed

If no multi-agent run is identifiable in scope (invoked with nothing to review), or
`deep` is requested but the journal directory can't be located, say so plainly and offer
the in-context retro instead. A clear "nothing to retro / journals not found, here's the
in-context view" is a valid result — a fabricated metric is not.

## What this skill is NOT

- Not a code or requirements review — `plan-verifier` and `architecture-reviewer`
  already do that; this skill has no opinion on whether the *output* was correct, only
  on how the *process* ran.
- Not a place to silently fix agent/skill prompts — findings are proposals (typed
  Recommendations), never auto-applied.
- Not a substitute for `engineering-insights` — a codebase-level gotcha still belongs in
  the relevant module's `INSIGHTS.md`, not here.
