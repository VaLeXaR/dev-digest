# server — context map (@devdigest/api)

## Before answering

Check [docs/](docs/), [specs/](specs/), and [INSIGHTS.md](INSIGHTS.md) in this module before reading code.

## Stack

Fastify 5 · Drizzle ORM · Postgres pgvector · Zod via fastify-type-provider-zod

## Commands

```sh
pnpm dev          # :3001
pnpm db:migrate   # IMPORTANT: run after every schema change — not auto on boot
pnpm db:seed      # idempotent demo data (acme/payments-api, PR #482)
pnpm test         # unit + integration
pnpm exec vitest run --exclude '**/*.it.test.ts'  # unit only (no Docker)
pnpm exec vitest run .it.test                     # integration only (requires Docker)
```

## Conventions

- Each feature is a self-contained Fastify plugin: `src/modules/<name>/`
- Route schemas are Zod-first (`fastify-type-provider-zod`) — no manual `Schema.parse()` in handlers
- DB-backed tests: `*.it.test.ts` suffix; hermetic tests: any other suffix
- Secrets: only through `SecretsProvider` (`src/adapters/secrets/local.ts`), never through `AppConfig`

## Do-not-touch

- `src/vendor/shared/` — this is `@devdigest/shared`; changes require sync with client
- **NEVER** edit existing migration files in `src/db/migrations/` — always generate a new one via `pnpm db:generate`

## Gotchas

- `REPO_INTEL_ENABLED=true` by default; unindexed repo silently degrades to diff-only (not an error)
- **IMPORTANT:** `INJECTION_GUARD` in `reviewer-core/prompt.ts` is the sole prompt-injection defense — do not add keyword scanning

## Read when

- API route map, DI flow, env variables → [README.md](README.md)
- Review pipeline (assemblePrompt, grounding) → [../reviewer-core/README.md](../reviewer-core/README.md)
- Test strategy, CI workflows → [../TESTING.md](../TESTING.md)
- Feature specs → [specs/](specs/)
- Accumulated module lessons → [INSIGHTS.md](INSIGHTS.md)
