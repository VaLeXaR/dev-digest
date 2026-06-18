# DevDigest — context map

## Before answering

Check the relevant module's `docs/`, `specs/`, and `INSIGHTS.md` before reading code.

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

## Read when

- Overall architecture, full flow from PR to findings → [README.md](README.md)
- Test strategy and CI workflows → [TESTING.md](TESTING.md)
- Agent prompts (general / security / performance) → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
