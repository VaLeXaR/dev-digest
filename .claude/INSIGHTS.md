# .claude/ — Engineering Insights

Tooling insights for the harness itself: hooks, settings, skills, agents.

## What Works

## What Doesn't Work

- 2026-07-17: A `type: agent` Stop hook cannot produce engineering insights — the agent gets no transcript, only the changed-file list, and the highest-value findings (user corrections, failed approaches, tool surprises) never appear in a diff; a dead end is by definition code that got thrown away. From a file list alone it can only restate what is obvious from reading the code — exactly what the skill's quality filter discards, so it yields noise or silence, never signal. Use a command hook returning `{"decision":"block","reason":…}` and let the main model, which has the turn in context, write them (`.claude/hooks/insights-stop-gate.sh`).
- 2026-07-17: **Auditing "has this recommendation already been promoted into a skill/agent?" by grepping the recommendation's own wording produces false negatives — twice in one audit.** A promoted rule is rewritten as an imperative, not pasted: the 2026-07-09 finding "implementer agents should be told not to launch verification with `run_in_background` and end their turn" landed in `implementer.md:31` as "**Never background your own verification command and then end your turn waiting for it**" — grepping `run_in_background` returns 0 and reads as "never landed". Separately, literal phrase greps break on the source's own backticks: `"Depends-on, not the whole phase"` misses `` `Depends-on`, not the whole phase's batch ``. Both false negatives nearly produced a duplicate rule in a file that already had it. Grep the *concept's* distinctive nouns (`background`, `notification`), or read the target's rule headings, before concluding a lesson is unlanded.
- 2026-07-17: `Edit(**INSIGHTS.md)` in `permissions.allow` never matches `client/INSIGHTS.md` — without a trailing slash `**` degenerates to `*`, which does not cross a path separator, so the rule only looks for `INSIGHTS.md` at the repo root and every module write gets denied. Always write `**/INSIGHTS.md` (`.claude/settings.json:4`).

## Codebase Patterns

- 2026-07-17: **`.claude/agents/WORKFLOW-INSIGHTS.md` is write-only with respect to future runs — a finding that lives only there never changes behaviour.** Nothing loads it before a run: `workflow-retro` reads it (for dedup), and `run-plan`/`sdd` name it only as a write destination. The retro recommendations that demonstrably held (per-task `Depends-on` dispatch, apply-Process-notes-forward) held because someone had promoted them into `run-plan/SKILL.md`'s own body, in a `**Rule.** … Confirmed costly in practice: …` shape that loads automatically with the skill. Conversely the 2026-07-09 `SendMessage`-resume recommendation sat unpromoted for 8 days despite having saved ~$10 and 35 minutes when applied. The working loop is: retro logs it → a human promotes it into the SKILL.md / agent definition that loads it → it fires next run. Write to `WORKFLOW-INSIGHTS.md` to remember; promote to change behaviour.

## Tool & Library Notes

- 2026-07-17: Hooks inside a single `hooks` array run in PARALLEL, not in sequence — a trailing cleanup hook cannot follow an earlier hook in the same array, it races it. Sequence by folding both steps into one script instead (`.claude/settings.json:20`).
- 2026-07-17: `jq` is not installed in this environment — a hook that emits JSON must escape it itself (`sed` for backslash, quote, newline) or shell out to `node` (≥22, always present). Do not add a `jq` dependency to a git-tracked hook: it breaks silently on any machine that clones the repo without it (`.claude/hooks/insights-stop-gate.sh`).
- 2026-07-17: `/tmp` resolves to different directories for Git Bash and for node on this Windows box — bash writes to its MSYS mount while `node -e` resolves the same literal to `D:\tmp` and fails `ENOENT`. Use the session scratchpad path for any file handed between the two.
- 2026-07-17: Stop hooks fire outside the turn, so they cannot be exercised by invoking them normally — test with `echo '{"stop_hook_active": false}' | bash .claude/hooks/insights-stop-gate.sh` and delete `.claude/tmp/insights-last-run` between runs, since any fire (real or test) consumes the watermark and the next run goes silent.
- 2026-07-19: A stray untracked file literally named `NUL` (a few KB) keeps materializing in the repo root on this Windows box and shows up as `?? NUL` in `git status` — it's the Windows null-device name (`>NUL`/`2>NUL`) leaking from some cmd/PowerShell-style redirect (a hook, rtk, or a tool call) into a context where it's treated as a real file, not the bit-bucket. Git Bash uses `/dev/null`; `NUL` is NOT special there. It also trips the insights stop-gate (counts as a "changed file"). Don't commit it, and use `/dev/null` in any repo-tracked script. Root cause is whichever script redirects to `NUL` — fix there rather than repeatedly `rm NUL`.

## Decisions

- 2026-07-17: Insights capture stays on `Stop`, not `SessionEnd`. SessionEnd runs after the session is over — it can neither feed context to the model nor make it write anything, so it would leave the same blind agent while adding loss on abnormal exit. Stop also matches the skill's own "capture mid-session, don't defer" rule.
- 2026-07-17: The watermark `.claude/tmp/insights-last-run` is bumped when the gate ASKS, not on every Stop, so a turn the model judges insight-free no longer buries its own paths. Loop safety instead comes from `stop_hook_active` (silences the gate on the turn following a block) plus excluding `INSIGHTS.md` from the candidate list, so writing an insight is not itself new work that re-triggers the gate (`.claude/hooks/insights-stop-gate.sh`).

- 2026-07-17: Harness work (`.claude/` — hooks, `settings.json`, skills, agents) writes to `.claude/INSIGHTS.md`; the skill's "Which File" table was extended to cover it plus `mcp-server/` and `evals/`, which already had files but no row. Reason: harness findings are exactly what this skill exists for, and before this they had nowhere to go but the wrong module (`.claude/skills/engineering-insights/SKILL.md`).

- 2026-07-17: A read-only agent that finds something insight-worthy reports it as a **candidate** in its own output; it never gets `Edit`/`Write` to record it itself. `architecture-reviewer` gained an `### Insight candidates` section for this — the caller filters and writes. Reason: the agent's read-only contract is the property that makes it trustworthy as a reviewer, and it must not be traded away for a side concern. Same principle as the Stop gate — whoever has both the context and the right to write does the writing (`.claude/agents/architecture-reviewer.md`).

## Recurring Errors & Fixes

## Session Notes

- 2026-07-17: Replaced the agent Stop hook with a blocking command gate (`.claude/hooks/insights-stop-gate.sh`); deleted `.claude/hooks/collect-insights-changes.sh`, whose watermark logic was folded in. Verified live — the gate fired on its own first session.

## Open Questions

- 2026-07-17: ~~The skill's "Which File" table lists only four modules while `mcp-server/`, `evals/` and `.claude/` also receive writes.~~ Resolved same day — table extended, see Decisions.
- 2026-07-17: `plan-verifier` findings are deliberately NOT routed into INSIGHTS — "requirement X is uncovered" is a fact about one plan, not about the codebase, so it has nothing durable to contribute. Revisit only if verifier runs start surfacing repeated codebase-level patterns. (`architecture-reviewer` is covered as of today; `implementer` invokes the skill itself per CLAUDE.md; `SubagentStop` stays unconfigured by choice — a read-only agent must not gain write access just to record a note.)
