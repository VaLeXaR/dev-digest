# evals — INSIGHTS

Engineering insights for the DevDigest Claude Code harness evals (`evals/`). Read before touching
the eval engine, cases, or CI wiring. Entries are high-confidence guidance unless a later dated
note supersedes them.

## What Doesn't Work

- 2026-07-15: DeepSeek (`deepseek/deepseek-chat`) does NOT dispatch subagents on the tool tiers (`agentTask`/`workflowTask`) — it performs the work inline instead, so `dispatch`-kind cases fail even though the model "did the right thing". Do not default the tool tiers to DeepSeek. `google/gemini-2.5-flash` is the only cheap OpenRouter model verified to actually dispatch (measured in `README.md` §"Which cheap model — verified"). DeepSeek is fine on the content tier only.

## Codebase Patterns

- 2026-07-15: Split the OpenRouter model by tier in CI, not one model for all. Content tier (`skills`) talks to OpenRouter natively (no proxy) → DeepSeek works and is cheapest. Tool tiers (`agents`/`workflow`) run inside the Claude Agent SDK, which speaks the Anthropic wire protocol → they need the bundled LiteLLM proxy (`pnpm proxy:up`) + a dispatch-capable model (Gemini Flash). See `.github/workflows/harness-evals.yml` (skills job has no `OPENROUTER_BASE_URL`; agents/workflow jobs point it at `http://localhost:4000`).
- 2026-07-15: `scripts/ci-detect.mjs` reads `$CHANGED_FILES` (newline-separated, repo-relative) and maps artifacts → suites: `.claude/skills/<name>/**` or `evals/skills/<name>/**` → `skills` output; `.claude/agents/<name>.md` or `evals/agents/<name>/**` → `agents` output; `CLAUDE.md` / any agent / `evals/src/**` / `evals/workflow/**` → `run_workflow=true`. It writes GitHub step outputs directly via `$GITHUB_OUTPUT`.
- 2026-07-15: A changed artifact with NO written evals is reported on the `skipped_skills`/`skipped_agents` outputs — deliberately separate from real failures — so the PR shows a visible `SKIP <name> (no evals)` instead of going red (`scripts/ci-detect.mjs:56-59`). Preserve this split when editing the detector; conflating them would fail PRs for merely uncovered artifacts.

## Decisions

- 2026-07-15: CI eval gate is wired to the mature `evals/` harness, NOT `skill-evals/` (still a scaffold per its own README) nor the co-located `.claude/skills/*/evals/` data. `ci-detect.mjs` only inspects `evals/skills/<name>/` and `evals/agents/<name>/` for `*.eval.ts`. If the project later adopts the co-located `skill-evals/` runner, the detector and workflow both need rework.
- 2026-07-15: PR gate policy in `.github/workflows/harness-evals.yml`: skills + agents jobs BLOCK merge; the workflow tier is `continue-on-error: true` (non-blocking) because `activation`/`dispatch` cases are flaky on cheap non-Anthropic tool-tier models (rate-limit degradation + behaviour-shaped assertions — see `README.md` caveats).
- 2026-07-15: Model is a knob, not code — CI resolves `EVAL_MODEL` as `inputs.<tier>_model || vars.EVAL_<TIER>_MODEL || <default>`. Override per-run via `workflow_dispatch` inputs, or repo-wide via Actions variables; never edit the workflow to change models.

## Session Notes

- 2026-07-15: Wired the first per-PR eval CI (`.github/workflows/harness-evals.yml`) — `detect` job (git-diff → `ci-detect.mjs`) fans out to per-skill and per-agent matrix jobs plus a conditional workflow-tier job, all on the OpenRouter backend. Requires repo Actions secret `OPENROUTER_API_KEY`. `evals/README.md` still documents an older static workflow sketch — update it to point at `harness-evals.yml` when convenient.
