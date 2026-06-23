---
name: semver-discipline
description: Use when modifying shared Zod contracts in vendor/shared/contracts/, adding or removing API route fields, or changing enum values — classifies the change as additive vs breaking and determines the correct migration path.
---

# Semver Discipline — DevDigest Contracts & APIs

This project does not publish npm packages, so "semver" here means: **will this change break any consumer that already works?** Consumers are the Next.js client, the reviewer-core, and any external CI caller of the API.

## Classify the change first

```
Is the consumer required to send or handle something new?
  YES → Breaking
  NO  → Additive (safe)
```

| Change | Classification |
|---|---|
| Add optional field to response (`z.string().nullish()`) | Additive |
| Add new API endpoint | Additive |
| Add new enum value to a response enum | Additive |
| Remove a field from response | **Breaking** |
| Rename a field | **Breaking** |
| Change a field type (`string` → `number`) | **Breaking** |
| Remove or rename an endpoint | **Breaking** |
| Make an optional field required | **Breaking** |
| Add required field to a request body | **Breaking** |
| Add new enum value to a request enum | **Breaking** (client must be updated first) |

## Additive changes — safe to ship directly

```ts
// Before
export const Skill = z.object({ id: z.string(), name: z.string() });

// After — additive: new optional field, old clients ignore it
export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()).nullish(),   // ← additive
});
```

Mirror the change to both `server/src/vendor/shared/` and `client/src/vendor/shared/` in the same commit.

## Breaking changes — always use a deprecation window

Never ship a breaking change and client update in separate PRs without a deprecation window. Follow the [deprecation-policy](../deprecation-policy/SKILL.md) three-phase pattern.

## Enum values require special care

**Response enums** — adding a value is additive only if the client handles `unknown` variants (e.g. a `default` branch in a switch). If the client exhaustively switches without a default, it's breaking.

**Request enums** — adding a value is always breaking (server accepts it before client knows to send it — no issue), but removing a value is breaking immediately.

## Quick checklist

Before committing a contract change:
1. Classified as additive or breaking?
2. If additive: both vendor copies updated in the same commit?
3. If breaking: deprecation phase started, old shape still returned?
4. If enum change: client switch statements have a `default` branch?
