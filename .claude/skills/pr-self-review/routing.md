# Routing — diff scope + file→skill map

How the skill decides *what* to review and *which skills* to apply. Read with
[SKILL.md](SKILL.md) (procedure) and [gate.md](gate.md) (the gate).

## 1. Diff scope

```bash
BASE="$(git merge-base origin/main HEAD)"
```

"All open changes" = everything not yet on `main`, including the working tree:

| Source | Command |
|---|---|
| Committed-not-merged + staged + unstaged | `git diff "$BASE"` |
| Untracked files | `git ls-files --others --exclude-standard` |

**Review added/modified lines only.** Use hunk ranges from `git diff "$BASE"` to bound
findings. Never flag pre-existing problems on lines the diff doesn't touch — even inside a
changed file. A self-review must not block a PR for legacy code the author didn't write.

### Always skip

- `client/src/vendor/shared/**` and `server/src/vendor/shared/**` — vendored/generated.
  *Exception:* feed the touched files to the contract-drift check (§4) — read, never flag
  style on them.
- `**/db/migrations/**` — do-not-touch per CLAUDE.md.
- `node_modules/`, `dist/`, `.next/`, lockfiles (`*-lock.json`, `pnpm-lock.yaml`).
- Pure docs: `*.md`, `*.json` files with no executable code (config schemas are not pure docs).

## 2. Buckets

| Bucket | Path globs |
|---|---|
| **UI / frontend** | `client/**/*.{tsx,ts,css}` (excluding `vendor/`) |
| **Backend / domain** | `server/**/*.ts`, `reviewer-core/**/*.ts` (excluding `vendor/`, `migrations/`) |
| **E2E / tests** | `e2e/**`, `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx` |

A `.ts` / `.tsx` file is always *also* in the full-stack pass (TS + Zod + security).

## 3. Skill map

### UI bucket

- `react-frontend-architecture` — where code lives, component splitting, App Router
  organization, feature vs shared components, barrel exports.
- `react-best-practices` — anti-patterns, hooks rules, derive-don't-store, state management
  (CRITICAL / HIGH / MEDIUM).
- `next-best-practices` — RSC boundaries, data fetching, server/client component rules,
  metadata, route handlers, image optimization.

### Backend bucket

- `onion-architecture-node` — layering / dependency rule; architecture gate (CRITICAL on
  violation).
- `fastify-best-practices` — routes, plugins, JSON Schema validation, error handling,
  performance, auth.
- `drizzle-orm-patterns` — DB queries, transactions, relations, schema changes.
- `postgresql-table-design` — schema/index/constraint review. Migration files are read-only
  (never flag style inside `db/migrations/`).

### Full-stack (runs on any changed `.ts` / `.tsx`)

- `typescript-expert` — type-level correctness, unsafe casts, generic constraints.
- `zod` — schema validation patterns, safeParse usage, error handling.
- `security` — OWASP Top 10:2025, injection, auth, XSS, secrets, file uploads.

### Test files only (never blocks)

- `react-testing-library` — query priority, userEvent, async patterns, mocking. Style-level
  findings only; test quality never gates a merge.

### Always feed to each subagent

The touched package's `INSIGHTS.md` as extra review criteria:

- `client/` → `client/INSIGHTS.md`
- `server/` → `server/INSIGHTS.md`
- `reviewer-core/` → `reviewer-core/INSIGHTS.md`

Project-specific gotchas that generic skills don't know. Skip silently if the file doesn't
exist.

## 4. Contract-drift check (project-specific CRITICAL)

`@devdigest/shared` contracts are vendored into **two** copies that must stay identical:

```
client/src/vendor/shared/contracts/*.ts
server/src/vendor/shared/contracts/*.ts
```

Known contracts: `brief.ts`, `eval-ci.ts`, `findings.ts`, `knowledge.ts`,
`observability.ts`, `platform.ts`, `productionize.ts`, `review-api.ts`, `trace.ts`,
`why.ts`.

If the diff touches a contract in one copy but not the matching file in the other — or the
two copies differ for any touched contract — that is a **CRITICAL**. Compare with:

```bash
git diff --no-index \
  client/src/vendor/shared/contracts/<name>.ts \
  server/src/vendor/shared/contracts/<name>.ts
```

Per CLAUDE.md these files are not edited by hand; drift means a regeneration step was missed.
Surface it, do not patch one side manually.
