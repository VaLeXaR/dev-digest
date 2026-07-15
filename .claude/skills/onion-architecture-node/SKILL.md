---
name: onion-architecture-node
description: "Onion / ports-and-adapters layering for the DevDigest backend (server/ + reviewer-core/). Use when adding or reviewing backend code — placing routes/services/repositories/adapters, deciding where a DB query or external SDK call (LLM, GitHub, git, ripgrep, ast-grep) may live, wiring DI in platform/container.ts, defining a new port in @devdigest/shared, or keeping reviewer-core pure. Enforces the dependency rule and ships a dependency-cruiser gate. NOT for client/ frontend (use react-frontend-architecture)."
version: "1.0.0"
---

# Onion Architecture — DevDigest Backend

The backend **already is** an onion / ports-and-adapters architecture; this skill names it,
maps it onto our real files, and **forces** it with a `dependency-cruiser` gate. Use whenever
you add or review code under `server/` or `reviewer-core/`.

For the full reading list, see [README.md](README.md).

## The One Rule

**All imports point inward.** A file may depend on layers more central than itself; it may
never depend on a layer further out. Inner layers declare interfaces (ports); outer layers
implement them; the composition root wires them together.

> "The database is not the center. It is external." — Jeffrey Palermo

Infrastructure (DB, HTTP clients, file system) changes frequently. The onion exists precisely
to protect the core from those changes. Tests are also at the outer edge — they depend on
inner layers but inner layers never depend on tests.

```
        ┌──────────────────────────────────────────────────┐
        │  Transport  modules/*/routes.ts + Fastify plugins │  ↑ outermost
        │   ┌──────────────────────────────────────────┐   │
        │   │  Infrastructure / Adapters                │   │
        │   │   src/adapters/*  ·  db/**                │   │
        │   │   modules/*/repository*.ts                │   │
        │   │   ┌──────────────────────────────────┐   │   │
        │   │   │  Application  modules/*/service.ts│   │   │
        │   │   │   ┌──────────────────────────┐   │   │   │
        │   │   │   │  Ports  @devdigest/shared │   │   │   │
        │   │   │   │  src/vendor/shared/**     │   │   │   │
        │   │   │   │   ┌──────────────────┐   │   │   │   │
        │   │   │   │   │  Core            │   │   │   │   │
        │   │   │   │   │  reviewer-core/  │   │   │   │   │
        │   │   │   │   │  src/** (pure)   │   │   │   │   │
        │   │   │   │   └──────────────────┘   │   │   │   │
        │   │   │   └──────────────────────────┘   │   │   │
        │   │   └──────────────────────────────────┘   │   │
        │   └──────────────────────────────────────────┘   │
        │       composition root: platform/container.ts     │
        └──────────────────────────────────────────────────┘
```

The composition root (`platform/container.ts`) is the **only** place allowed to know both a port and its concrete adapter — its job is to bind them.

## Layer Map

Full table with allowed/forbidden imports per layer and real file references: **[layer-map.md](layer-map.md)**

| Layer | Path | May import | Must NOT import |
| --- | --- | --- | --- |
| Core | `reviewer-core/src/**` | itself, shared contract types | `fastify`, `drizzle-orm`, `octokit`, `simple-git`, `postgres`, `src/adapters/**`, `db/**` |
| Ports | `@devdigest/shared` (`src/vendor/shared/**`) | other shared types | anything concrete |
| Application | `modules/*/service.ts`, `run-executor.ts` | ports, `container`, own `repository`/`helpers` | `src/adapters/**` (concrete SDKs) |
| Infrastructure | `src/adapters/**`, `db/**`, `modules/*/repository*.ts` | ports, drivers/SDKs, `db/schema` | `modules/**` (a feature) |
| Composition root | `platform/container.ts` | everything (binds ports→adapters) | — |
| Transport | `modules/*/routes.ts` + plugins | own `service`, `_shared`, contracts | `src/adapters/**`, `db/schema` |

## Decision Framework

Apply in order when placing a change:

1. **External call** (HTTP, DB, git, LLM, ripgrep/ast-grep)? → **port** in `src/vendor/shared/adapters.ts` + **adapter** in `src/adapters/<kind>/`. Never call an SDK from a service or route.
2. **DB query?** → `modules/<name>/repository.ts`. The only files allowed to touch `db/schema` + `drizzle-orm`. Return domain rows, not leaked query builders.
3. **Business orchestration?** → `modules/<name>/service.ts`. Depends on interfaces via `container`, never on a concrete adapter class.
4. **HTTP wiring?** → `modules/<name>/routes.ts`. Zod schema → call service → map result. No logic, no DB, no SDK.
5. **Pure domain logic** (diff → prompt → grounded findings, scoring)? → `reviewer-core/`. Its only outside contact is the injected `LLMProvider`. No I/O.
6. **Cross-module need?** → reach through `container.*` (e.g. `container.repoIntel.*`, `container.agentsRepo`). Never import another `modules/<other>/` internal file.

## Adding a New External Dependency (Canonical Move)

1. **Define the port first** — interface in `src/vendor/shared/adapters.ts` that speaks the app's language ("I need to post a review comment"). No vendor name in the interface name or shape.
2. **Implement the adapter** in `src/adapters/<kind>/<impl>.ts` wrapping the SDK.
3. **Add a mock** in `src/adapters/mocks.ts` so tests can inject it.
4. **Wire in the container** (`platform/container.ts`) as a lazy getter; add a field to `ContainerOverrides`.
5. Services consume `container.<port>` — they never see the SDK.

This is exactly how `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, and `SecretsProvider` already work.

## Enforcement

The dependency rule is not a convention you remember — it is a `dependency-cruiser` gate.
Full config, npm scripts, severity rationale, and exception ledger: **[enforcement.md](enforcement.md)**

Before claiming a backend change is done, run:

```bash
cd server && npm run depcruise
```

Validated against the real graph: **0 errors, 15 warnings** today. The gate exits non-zero only on an `error`, so it is green now and blocks any new `error`. `warn`s are known drift — not license to add more.

## Known Drift (Do Not Fix Silently)

`warn` rules = current violations to burn down, then promote to `error`:

- **8** files touch `db/schema` outside a repository — `polling`/`pulls`/`workspace`/`settings` routes, `reviews/run-executor`, `reviews/diff-loader`, `repos/helpers`, `settings/feature-models`.
- **2** cross-module edges — `pulls/routes.ts → reviews/helpers.ts` and `repos/service.ts → repo-intel/constants.ts`.
- Circular deps — mostly via `platform/container.ts` DI root + one genuine `agents/helpers → agents/repository` cycle.

When you burn down a `warn` backlog in code, tighten the severity in `.dependency-cruiser.cjs` in the same change.

<!-- ci-trigger: touch to exercise the onion-architecture-node skill eval — no behavioral change -->
