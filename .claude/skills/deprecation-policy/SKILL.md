---
name: deprecation-policy
description: Use when removing a Zod contract field, dropping a DB column, removing an API endpoint, or renaming a field in the DevDigest shared contracts. Provides a three-phase sequence that prevents data loss and client breakage.
---

# Deprecation Policy — DevDigest

Never remove a field, column, or endpoint in a single step. Each removal goes through three phases spread across separate PRs.

## Three-Phase Sequence

### Phase 1 — Make optional (current PR)

**Zod contract:** change the field to `.nullish()` so existing clients don't break when the server starts returning `null`.

```ts
// Before
cost_usd: z.number(),

// Phase 1 — field is now optional; client must handle null
cost_usd: z.number().nullable(),
```

**Server handler:** stop populating the field (return `null`). Do NOT remove it from the DB yet.

**Client:** add a null-guard wherever the field was used. Render `—` or a fallback.

Mirror both `server/src/vendor/shared/` and `client/src/vendor/shared/`.

### Phase 2 — Ship + observe (next PR or sprint boundary)

Verify no client feature depends on the field being non-null. Keep the DB column and the nullish Zod field in place — removal is a separate concern.

### Phase 3 — Drop (separate PR, after Phase 2 lands)

**Zod contract:** remove the field entirely from both vendor copies.

**DB column:** generate a new migration:

```sh
cd server && pnpm db:generate   # drops the column in a new .sql file
cd server && pnpm db:migrate
```

**NEVER** combine Phase 1 and Phase 3 in the same PR — that's a hard breaking change.

## Endpoint removal

Follow the same cadence:

1. Return `410 Gone` from the old endpoint with a `Location` header pointing to the replacement.
2. After all known callers migrate, remove the route.

## DB column removal specifically

A column that still has the Zod field is safe to keep indefinitely. Only generate a `DROP COLUMN` migration **after** the Zod field is removed from the contract (Phase 3). Doing it before means the server tries to return a field that no longer exists — silent runtime error.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Removed field from Zod but DB column still exists | Harmless, but creates confusion; finish Phase 3 |
| Dropped DB column before removing from Zod | Server query errors at runtime (column not found) |
| Combined Phase 1 and Phase 3 | Hard breaking change — client receives `undefined` where it expected a value |
| Removed endpoint without a deprecation window | CI callers start failing immediately |
