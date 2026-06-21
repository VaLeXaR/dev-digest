# Enforcement — the dependency-cruiser gate

This is what turns the dependency rule from "remember to" into "the build fails otherwise."
`dependency-cruiser` is **already** in `server/package.json` (today used only as the
`adapters/depgraph` implementation), so there is nothing new to install.

`dependency-cruiser` is a "test runner for your import graph": you declare `forbidden` rules
over `from → to` path patterns and it reports every edge that violates them. RE2-based —
so **no regex look-ahead**; exclusions are expressed with `pathNot`.

## 1. Add the Config — `server/.dependency-cruiser.cjs`

> CommonJS (`.cjs`) on purpose: `server` is `"type": "module"`, so a plain `.js` config would
> be parsed as ESM.

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'Cycles break the inward-only rule. WARN today: most cycles run through the DI ' +
        'composition root (container → service) — a tradeoff of the "service takes Container" ' +
        'style; plus one genuine same-module cycle agents/helpers → agents/repository to fix.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-pure',
      comment:
        'reviewer-core is the domain core: NO I/O. Only the injected LLMProvider. ' +
        'The same code runs in the server and in CI.',
      severity: 'error',
      from: { path: 'reviewer-core/src' },
      to: {
        path: [
          '^fastify', 'drizzle-orm', '^postgres', 'octokit', 'simple-git',
          '@ast-grep/napi', '/src/adapters/', '/src/db/', '^node:fs',
        ],
      },
    },
    {
      name: 'services-depend-on-ports',
      comment:
        'A feature service orchestrates through ports (via container.*), never a concrete ' +
        'adapter SDK wrapper. Exception: repo-intel IS the indexer subsystem (infrastructure).',
      severity: 'error',
      from: {
        path: 'src/modules/[^/]+/(service|run-executor)[^/]*\\.ts$',
        pathNot: 'src/modules/repo-intel/',
      },
      to: { path: 'src/adapters/' },
    },
    {
      name: 'routes-are-thin',
      comment: 'Transport (routes) calls the service; it never reaches into adapters.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'src/adapters/' },
    },
    {
      name: 'db-confined-to-repositories',
      comment:
        'Drizzle/db schema queries belong in modules/*/repository*. DRIFT (warn): 8 files ' +
        'query db/schema outside a repository (routes of polling/pulls/workspace/settings, ' +
        'plus reviews/run-executor, reviews/diff-loader, repos/helpers, settings/feature-models).',
      severity: 'warn',
      from: { path: 'src/modules/', pathNot: 'src/modules/[^/]+/repository' },
      to: { path: ['src/db/schema', '^drizzle-orm'] },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'One feature reaches another only through container.* (the composition root), never ' +
        'by importing its sibling module folder. _shared is the allowed common ground. WARN ' +
        'today: pulls/routes → reviews/helpers, and repos/service → repo-intel/constants.',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'adapters-dont-know-modules',
      comment:
        'Infrastructure must not depend on a feature. ' +
        'Exception: adapters/depgraph reads repo-intel/constants — move those constants out to remove it.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/repo-intel/constants' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['node_modules', '/dist/', '\\.test\\.ts$', '\\.it\\.test\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
```

## 2. Add the Scripts — `server/package.json`

```jsonc
{
  "scripts": {
    // server tree only (fast)
    "depcruise": "depcruise src --config .dependency-cruiser.cjs",
    // full coverage incl. reviewer-core as a first-class root (run before release / in CI)
    "depcruise:all": "depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs"
  }
}
```

## 3. Run It

```bash
cd server
npm run depcruise        # baseline today: 0 errors, 15 warnings
npm run depcruise:all    # also walks reviewer-core as a root for the core-is-pure rule
```

`dependency-cruiser` exits non-zero only on an **`error`**; warnings report without failing.
Wire `npm run depcruise` into CI next to typecheck/tests.

## Severity Rationale — Adopt as a Ratchet, Not a Big-Bang

Validated against the real graph (`125 modules, 376 dependencies`). Strict rules the codebase **already satisfies** are `error`; rules with genuine existing violations start at `warn` (a burn-down baseline) so the gate is adoptable immediately, then get promoted to `error` as each backlog is cleared.

- **`error` (clean today — keep them blocking):** `core-is-pure`, `services-depend-on-ports`, `routes-are-thin`, `adapters-dont-know-modules`. A new violation here fails CI.
- **`warn` (real drift, burn down then promote):**
  - `db-confined-to-repositories` — **8** files query `db/schema` outside a repository. Promote to `error` once each is moved into a `repository`.
  - `no-cross-module-internals` — **2** edges: `pulls/routes.ts → reviews/helpers.ts` (move the shared mapper into `_shared`) and `repos/service.ts → repo-intel/constants.ts` (relocate the shared constant). Promote after.
  - `no-circular` — cycles via `platform/container.ts` (the "service takes `Container`" DI style) plus one genuine same-module cycle `agents/helpers → agents/repository`. Fix the agents cycle; then decide a container-cycle policy before promoting.

## Known Exceptions and How to Retire Them

| Exception | Why it exists | Clean fix |
| --- | --- | --- |
| `repo-intel/service` may import adapters (`pathNot` on `services-depend-on-ports`) | repo-intel is the indexer subsystem, reached via the `container.repoIntel` facade — it *is* infrastructure | none needed; keep the facade boundary intact |
| `adapters/depgraph` → `repo-intel/constants` (`pathNot` on `adapters-dont-know-modules`) | shares `SUPPORTED_EXT` | move the shared constant to `platform/` or `_shared`, then delete the `pathNot` |

When you remove an exception (or burn down a `warn` backlog) in code, tighten the config in the same change. An exception that outlives its cause silently re-opens the boundary. That tightening *is* the ratchet.

## Validating the Config Itself

After editing rules, sanity-check that they parse and that the exception scoping is right:

```bash
cd server
npx depcruise src --config .dependency-cruiser.cjs --output-type err-long   # readable report
npx depcruise src --config .dependency-cruiser.cjs --output-type dot | dot -T svg > graph.svg
```

---

## The Dependency Rule in TypeScript (Code Patterns)

Drizzle belongs in infrastructure only. Domain and application depend on interfaces (ports).

```typescript
// domain/repository.port.ts — pure interface, zero Drizzle imports
export interface IReviewRepository {
  findById(id: string, workspaceId: string): Promise<Review | null>;
  save(review: Review): Promise<void>;
}

// application/service.ts — depends on the port, never on DrizzleReviewRepository
export class ReviewService {
  constructor(private readonly repo: IReviewRepository) {}
  async getReview(id: string, workspaceId: string) {
    return this.repo.findById(id, workspaceId);
  }
}

// infrastructure/repository.ts — Drizzle lives HERE only
import { db } from '../../db/client';
export class DrizzleReviewRepository implements IReviewRepository {
  async findById(id: string, workspaceId: string) {
    return db.query.reviews.findFirst({ where: ... });
  }
}

// platform/container.ts — composition root wires concretion → interface
const reviewRepo: IReviewRepository = new DrizzleReviewRepository(db);
const reviewService = new ReviewService(reviewRepo);
```

## Fastify Routes Are Adapters

`routes.ts` translates HTTP ↔ application DTOs. It never contains business logic or DB queries.

```typescript
// ✅ correct — route calls service, maps response
fastify.get('/:id', { schema }, async (req) => {
  const review = await service.getReview(req.params.id, ctx.workspaceId);
  return toReviewResponse(review);
});

// ❌ wrong — route bypasses service, reaches into DB directly
fastify.get('/:id', { schema }, async (req) => {
  return db.query.reviews.findFirst({ where: eq(reviews.id, req.params.id) });
});
```

## Common Violations

| Violation | Fix |
| --- | --- |
| `service.ts` imports `from 'drizzle-orm'` | Extract `repository.port.ts` + `repository.ts`; inject port |
| Route handler calls `repo.findById(...)` directly | Route calls `service.getXxx(...)` only |
| Domain type imports from `infrastructure/` | Flip — infra imports domain, not vice versa |
| Business aggregation / filter logic in `routes.ts` | Move to `service.ts` |
| `container.ts` exposes concrete class to service constructor type | Type the parameter as the port interface |
| Module A imports module B's repository | Expose via module B's service method; modules communicate through services |
