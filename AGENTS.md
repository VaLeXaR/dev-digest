# DevDigest — context map

## Before answering

Check the relevant module's `docs/`, `specs/`, and `INSIGHTS.md` before reading code. After reading, confirm: "I've read INSIGHTS.md — the top 3 relevant points are: …". This forces active processing, not passive loading. Treat every entry as high-confidence guidance unless told otherwise.

## Session end

After any substantial session (non-trivial findings, problem solved, or discovery made), use `/engineering-insights` to write new entries to the relevant `INSIGHTS.md`. Skip this step for trivial or purely mechanical sessions.

## Stack

TypeScript monorepo — Node ≥22, pnpm ≥10, Docker (Postgres only).
NO workspace hoisting — each package has its own `node_modules`.
Cross-package code: tsconfig path aliases, not published modules.
`@devdigest/shared` → `server/src/vendor/shared` (single source of Zod contracts for all packages).

## Packages

| Folder | Package | Port |
| --- | --- | --- |
| `server/` | `@devdigest/api` | :4001 |
| `client/` | `@devdigest/web` | :4000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | — |
| `e2e/` | `@devdigest/e2e` | — |

## Commands

```sh
./scripts/dev.sh    # start everything: Postgres + API :4001 + web :4000
docker compose down # stop Postgres — NEVER add -v (destroys all data permanently)
```

## Gotchas

- **IMPORTANT:** Migrations do NOT run on boot → `cd server && pnpm db:migrate` after every schema change
- **NEVER** `docker compose down -v` — deletes the pgdata volume with all imported repos and reviews
- Secrets (API keys, GITHUB_TOKEN) → `~/.devdigest/secrets.json` (mode 0600), not `.env` and not DB
- API/web run on :4001/:4000 (`server/.env`, `client/.env`), not :3001/:3000 → if the devdigest MCP server can't reach the API, check `.mcp.json`'s `DEVDIGEST_API_URL` matches
- **NEVER** `pnpm test -- <filter>` in `client/` — pnpm forwards a literal `"--"` arg into `vitest run`, which does not filter and instead hangs/misbehaves → use `pnpm exec vitest run <path-or-glob>` to scope a run. Parallel `implementer` dispatches that used the `--` form left dozens of orphaned `vitest`/`tinypool` worker processes running for 90+ minutes, starving CPU for every other agent on the same machine (observed 2026-07-09, `/run-plan` on `project-context`: ~166 zombie `node.exe` processes accumulated across one multi-phase run). If a `pnpm test`/`vitest run` hangs with zero output on a shared machine mid-multi-agent-run, check for and kill orphaned `tinypool`/`vitest.mjs run "--"` processes before assuming it's a real regression.

> **Self-improving:** When a new project-wide operational constraint is confirmed — a destructive command, a silent failure mode, a credentials invariant — append it above. Format: `**NEVER/ALWAYS** [why] → [rule]`. Monthly: remove rules no longer relevant. Not a crutch — if a gotcha recurs because the tooling is awkward, fix the root cause instead.

## Agents

Use only project agents from `.claude/agents/` by default:
`spec-creator`, `implementation-planner`, `implementer`, `researcher`, `architecture-reviewer`, `plan-verifier`, `doc-writer`, `test-writer`.

Spawn a generic agent only if explicitly asked.

**ALWAYS** delegate to `researcher` first for any request about external best practices, documentation, library APIs, or technology standards — before reading any project files or calling WebSearch directly.

### Spec-Driven Development pipeline

`spec-creator` → `implementation-planner` → `implementer` (×N, multi-agent) → `plan-verifier` → `architecture-reviewer` (Sonnet) → [`test-writer`, disabled by default] → `plan-verifier` (final gate) → `pr-self-review` (hook-enforced before `git push`).

Two orchestrator skills cover this — pick based on whether a plan already exists:

- **`/sdd`** (`.claude/skills/sdd/SKILL.md`) — full pipeline from a spec file, a freeform
  requirements prompt, and/or design references, through the build+verify stages below.
- **`/run-plan docs/plans/<name>.md`** (`.claude/skills/run-plan/SKILL.md`) — build+verify only,
  for a plan that's already been through `implementation-planner` and `grilling` by hand. Does not
  create or clarify specs/plans.

`spec-creator` and `implementation-planner` are also routinely dispatched by hand, one at a time,
outside either orchestrator — both skills exist alongside manual per-agent dispatch, not instead of
it.

**Cost tuning (current defaults, revisit if quality regresses):**

- `architecture-reviewer` runs on Sonnet, not Opus — it loops (fix-iterate), and its checks are
  mechanical grep-and-cite rules, not deep interpretive judgment.
- `plan-verifier` stays on Opus — it's the merge gate with evidence-based per-requirement
  reasoning (e.g. per-entity vs. global cap misapplication), and loops less often.
- `test-writer` is disabled by default in both orchestrator skills — invoke it manually, or ask
  the orchestrator to enable it for a specific run, when test coverage is actually needed.

**Mandatory handoffs — do not skip, even mid-conversation.** These are pre-authorized: invoke the
named skill/agent immediately when its trigger condition is met, without pausing to ask the user
for permission first — asking only adds an avoidable round-trip for something that isn't
discretionary. Only skip when the user explicitly declines a specific handoff in advance.

- After `spec-creator` returns, run the `spec-clarification` skill on the written spec before `implementation-planner` treats it as confirmed input.
- After `implementation-planner` returns, run the `grilling` skill on the plan file before dispatching any `implementer`.
- After the multi-agent `implementer` run completes, run `plan-verifier` once (functional-only pass) **before** `architecture-reviewer` — catches cross-task integration gaps a single implementer can't see, before tokens are spent reviewing code that may still need to change.
- Run `architecture-reviewer` → fix critical/high → (optionally `test-writer`) → a final `plan-verifier` pass (pass `## Architecture review: PASS` to skip re-checking layering/DI/contract-sync) as the last gate before PR.

See `.claude/agents/README.md` for the full per-agent rationale and token-chaining patterns.

## Skills

Use only skills defined in `.claude/skills/` (project skills) by default. Do **not** invoke external or third-party skills (e.g. `superpowers:*`, `andrej-karpathy-skills:*`, or any skill not under `.claude/skills/`) unless the user explicitly requests one.

## Read when

- Overall architecture, full flow from PR to findings → [README.md](README.md)
- Test strategy and CI workflows → [TESTING.md](TESTING.md)
- Agent prompts (general / security / performance) → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
