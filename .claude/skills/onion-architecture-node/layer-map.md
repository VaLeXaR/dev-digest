# Layer Map — DevDigest Backend

Concrete mapping of each onion ring onto our files, with the tools that live there and the
allowed / forbidden imports. Read this when you are unsure *where* a piece of code belongs.

Paths are relative to `server/` unless noted. `@devdigest/shared` resolves to
`src/vendor/shared/`; `@devdigest/reviewer-core` resolves to `../reviewer-core/src/`
(see `server/tsconfig.json` `paths`).

---

## 1. Core / Domain — `reviewer-core/src/**`

The center. Pure functions: diff → `assemblePrompt` → `completeStructured` →
`groundFindings` → score. **The iron rule:** no I/O — no DB, fs, GitHub, git, or persistence;
its only outside contact is the injected `LLMProvider`. The same code runs in the server and
in CI, so it must stay free of infrastructure.

- **Lives here:** `grounding.ts`, `prompt.ts`, `review/*`, `output/*`, `llm/*`
- **May import:** itself; shared contract **types** (Zod schemas / DTOs)
- **Must NOT import:** `fastify`, `drizzle-orm`, `postgres`, `octokit`, `simple-git`, `@ast-grep/napi`, `node:fs`, `server/src/adapters/**`, `server/src/db/**`

## 2. Ports / Contracts — `@devdigest/shared` (`src/vendor/shared/**`)

The interfaces the inner layers depend on; outer layers implement them.

- **Lives here:** `adapters.ts` — `LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `AuthProvider`, `SecretsProvider`; `contracts/*` (DTOs, run trace, platform)
- **Rule:** ports name *what the application needs*, never a vendor. `GitHubClient`, not `Octokit`. A port with `openai` in its shape is a leak.
- **Note:** these contracts are **vendored as two hand-maintained copies** (`server/` and `client/`), synced by hand — adding a field means editing both.

## 3. Application / Services — `modules/<name>/service.ts`, `run-executor.ts`

Orchestration. Resolves targets, calls ports, persists via its repository, streams run events.

- **Lives here:** `reviews/service.ts` + `reviews/run-executor.ts`, `repos/service.ts`, `agents/service.ts`, `repo-intel/service.ts` (see exception below)
- **May import:** `platform/container` (to reach ports), `@devdigest/shared`, own `repository`/`helpers`/`constants`, `reviewer-core`
- **Must NOT import:** `src/adapters/**` (concrete SDK wrappers) — get adapters through `container.llm(...)`, `container.github()`, `container.git`, `container.codeIndex`, etc.
- **Exception:** `modules/repo-intel/service.ts` may import `adapters/codeindex/extract` and `adapters/astgrep` — it is the indexer subsystem (infrastructure reached via the `container.repoIntel` facade), not an ordinary feature service.

## 4. Infrastructure — `src/adapters/**`, `db/**`, `modules/*/repository*.ts`

The outer ring of *implementations*. Knows about vendors and drivers; knows nothing about
which feature calls it.

### 4a. External-service adapters — `src/adapters/<kind>/`

Each implements a port:

| Tool / SDK | Port | Adapter |
| --- | --- | --- |
| `@anthropic-ai/sdk`, `openai`, OpenRouter | `LLMProvider` | `adapters/llm/{anthropic,openai}.ts`, reviewer-core `OpenRouterProvider` |
| `octokit` | `GitHubClient` | `adapters/github/octokit.ts` |
| `simple-git` | `GitClient` | `adapters/git/simple-git.ts` |
| `@vscode/ripgrep` | `CodeIndex` | `adapters/codeindex/ripgrep.ts` |
| `@ast-grep/napi` | (internal) | `adapters/astgrep/index.ts` |
| `js-tiktoken` | `Tokenizer` | `adapters/tokenizer/index.ts` |
| `dependency-cruiser` | `DepGraph` | `adapters/depgraph/index.ts` |
| OpenAI embeddings | `Embedder` | `adapters/embedder/openai.ts` |
| `~/.devdigest/secrets.json` | `SecretsProvider` | `adapters/secrets/local.ts` |

- **May import:** the SDK it wraps, the port it implements, shared types
- **Must NOT import:** `modules/**` (an adapter must not know about a feature)
- **Exception:** `adapters/depgraph` imports `modules/repo-intel/constants.js` — a tracked infra→module edge; clean fix is relocating those constants

### 4b. Persistence — `db/**` + `modules/<name>/repository.ts`

Drizzle ORM + `postgres` (pgvector). The repository is the **only** code touching the schema.

- **May import:** `db/schema`, `db/client`, `drizzle-orm`, shared types
- **Returns** domain rows (`db/rows.ts` types), not raw query builders — keep Drizzle from leaking past the repository
- **New column:** edit `db/schema/*.ts`, then `npm run db:generate` to emit the migration; never hand-write migration SQL
- **Drift:** `polling`/`pulls`/`workspace`/`settings` `routes.ts` query `db/schema` inline (no repository yet) — flagged `warn`; migrate into a repository when you touch them

## 5. Composition Root — `platform/container.ts`

The single place that binds ports to concrete adapters. One per app instance; lazily
constructs adapters resolved through `SecretsProvider`; tests inject mocks via
`ContainerOverrides`. Because its whole purpose is wiring, it is *allowed* to import both
ports and concrete adapter classes — no other file is.

Also platform-level (cross-cutting, not a feature): `config.ts`, `errors.ts`, `sse.ts`,
`jobs.ts`, `grounding.ts`, `price-book.ts`, `resilience.ts`.

## 6. Transport + Tests — `modules/<name>/routes.ts`, Fastify plugins, `*.test.ts`

**Tests live at the outer edge.** Unit and integration tests can import any inner layer (services, repositories, domain types) but no inner layer ever imports a test. This means tests don't constrain the architecture — they are just another outer consumer, like the HTTP layer.

The outermost edge. A Fastify plugin per feature, registered in `modules/index.ts`.

- **Pattern:** declare Zod `params`/`body` schemas (via `fastify-type-provider-zod`) → call `service.method(...)` → map to DTO
- **May import:** own `service`, `_shared/context`, `@devdigest/shared` contracts
- **Must NOT import:** `src/adapters/**`; `db/schema` (go through the service/repository)
- Shared infrastructure (helmet, cors, rate-limit, SSE, error handler) is registered **before** modules so encapsulated module plugins inherit it

**Domain events (if introduced)** — follow the two-phase pattern: store events in memory during entity operations, publish them *after* persistence succeeds. This prevents events from propagating when a DB transaction rolls back.

---

## Quick "Where Does It Go?" Cheatsheet

| I need to… | Layer | File |
| --- | --- | --- |
| Call GitHub / an LLM / git / ripgrep | Infrastructure (adapter) | `src/adapters/<kind>/<impl>.ts` behind a port |
| Write a SQL / Drizzle query | Infrastructure (repository) | `modules/<name>/repository.ts` |
| Orchestrate: run review, fetch PR, persist result | Application | `modules/<name>/service.ts` |
| Parse/validate request, shape response | Transport | `modules/<name>/routes.ts` + Zod schemas |
| Produce grounded findings from a diff | Core | `reviewer-core/` (pure, no I/O) |
| Let feature A use something from feature B | Application (via DI) | `container.<port>` — never a direct import |
| Bind a port to a concrete adapter | Composition root | `platform/container.ts` only |
| Define "what the app needs" from GitHub | Ports | `src/vendor/shared/adapters.ts` |

---

## Existing Code That Gets This Right

- [`server/src/adapters/`](../../../server/src/adapters/) — canonical infrastructure layer; every external integration behind an interface from `@devdigest/shared`
- [`server/src/platform/container.ts`](../../../server/src/platform/container.ts) — composition root; the only place `new` is called on infrastructure classes
- [`server/src/vendor/shared/`](../../../server/src/vendor/shared/) — domain-level port definitions (`AuthProvider`, `GitHubClient`, `LLMProvider` are textbook ports)
- [`reviewer-core/src/`](../../../reviewer-core/src/) — pure domain core; zero infrastructure imports
