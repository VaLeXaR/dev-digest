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
| `server/` | `@devdigest/api` | :3001 |
| `client/` | `@devdigest/web` | :3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | — |
| `e2e/` | `@devdigest/e2e` | — |

## Commands

```sh
./scripts/dev.sh    # start everything: Postgres + API :3001 + web :3000
docker compose down # stop Postgres — NEVER add -v (destroys all data permanently)
```

## Gotchas

- **IMPORTANT:** Migrations do NOT run on boot → `cd server && pnpm db:migrate` after every schema change
- **NEVER** `docker compose down -v` — deletes the pgdata volume with all imported repos and reviews
- Secrets (API keys, GITHUB_TOKEN) → `~/.devdigest/secrets.json` (mode 0600), not `.env` and not DB

> **Self-improving:** When a new project-wide operational constraint is confirmed — a destructive command, a silent failure mode, a credentials invariant — append it above. Format: `**NEVER/ALWAYS** [why] → [rule]`. Monthly: remove rules no longer relevant. Not a crutch — if a gotcha recurs because the tooling is awkward, fix the root cause instead.

## Agents

Use only project agents from `.claude/agents/` by default:
`planner`, `implementer`, `researcher`, `architecture-reviewer`, `plan-verifier`, `doc-writer`, `test-writer`.

Spawn a generic agent only if explicitly asked.

## Skills

Use only skills defined in `.claude/skills/` (project skills) by default. Do **not** invoke external or third-party skills (e.g. `superpowers:*`, `andrej-karpathy-skills:*`, or any skill not under `.claude/skills/`) unless the user explicitly requests one.

## Read when

- Overall architecture, full flow from PR to findings → [README.md](README.md)
- Test strategy and CI workflows → [TESTING.md](TESTING.md)
- Agent prompts (general / security / performance) → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
