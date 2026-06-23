---
name: breaking-change
description: Use when any diff touches server/src/db/schema/, server/src/vendor/shared/, client/src/vendor/shared/, or server/src/db/migrations/ in the DevDigest project. Catches the three silent breaking-change patterns before they cause runtime failures or data loss.
---

# Breaking Change Guard — DevDigest

Three areas in this codebase break silently at runtime — no compile error, no test failure, just broken behaviour in production or a corrupted DB state. Check all three before any commit that touches them.

## Invariant 1 — Schema → Migration (always required)

Any edit to `server/src/db/schema/**` **must** be paired with a freshly generated migration.

```sh
cd server && pnpm db:generate   # diffs schema vs journal, writes new .sql to src/db/migrations/
cd server && pnpm db:migrate    # applies it — NOT run automatically on boot
```

**NEVER** hand-edit or amend files in `server/src/db/migrations/`. `pnpm db:generate` is the only valid author of migration files.

## Invariant 2 — Shared Contract Sync

`server/src/vendor/shared/` and `client/src/vendor/shared/` are manual copies of the same source — they are **not linked by any build step**. Changing one without mirroring the other produces a silent client/server type divergence that TypeScript cannot catch across packages.

After editing either copy, verify they match:

```sh
diff -r server/src/vendor/shared/ client/src/vendor/shared/
```

Zero output = in sync. Any output = breaking.

## Invariant 3 — Docker Volume

**NEVER** `docker compose down -v` — it permanently deletes the `pgdata` volume with all imported repos and reviews. Use `docker compose down` (no flags) to stop.

## Checklist

Scan your diff for these patterns and run the corresponding action before committing:

| File pattern touched | Required action |
|---|---|
| `server/src/db/schema/**` | `pnpm db:generate` + `pnpm db:migrate` |
| `server/src/vendor/shared/**` | Mirror changes to `client/src/vendor/shared/` |
| `client/src/vendor/shared/**` | Mirror changes to `server/src/vendor/shared/` |
| `server/src/db/migrations/**` (existing file) | Stop — was this hand-edited? Revert and regenerate. |

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Schema edited, no migration | App boots, DB queries silently fail on the missing column | `pnpm db:generate && pnpm db:migrate` |
| Migration generated, not applied | Same as above on the next environment that pulls the branch | `cd server && pnpm db:migrate` |
| Contract updated on server only | Client receives unknown/extra fields; TypeScript passes because each package compiles in isolation | Mirror to `client/src/vendor/shared/` |
| Contract updated on client only | Server returns shape the client doesn't expect | Mirror to `server/src/vendor/shared/` |
| Migration file hand-edited | Future `db:generate` may conflict; migration journal desync | Revert the edit, fix the schema, regenerate |
