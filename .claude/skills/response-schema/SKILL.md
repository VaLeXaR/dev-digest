---
name: response-schema
description: Use when adding or modifying Fastify route handlers in server/src/modules/. Covers how to wire a Zod response schema so Fastify serializes correctly, the TypeScript return type stays in sync with the shared contract, and no extra DB fields leak to the client.
---

# Response Schema — DevDigest Fastify Routes

Fastify 5 with `fastify-type-provider-zod` validates and serializes responses **only** when a `response` key is present in the route schema. Without it, handlers use `JSON.stringify` — extra DB columns leak and the return type is inferred as `unknown`.

## Pattern

Always define `response` alongside `params` / `body`:

```ts
import { ConventionCandidate } from '../../vendor/shared/contracts/knowledge.js';

app.get(
  '/repos/:id/conventions',
  {
    schema: {
      params: IdParams,
      response: {
        200: z.array(ConventionCandidate),
      },
    },
  },
  async (req): Promise<z.infer<typeof ConventionCandidate>[]> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(req.params.id, workspaceId);
  },
);
```

**Key points:**
- The `200` key is the HTTP status. Add `204: z.void()` for no-content routes.
- Import the Zod schema from `vendor/shared/contracts/` — the response schema IS the contract.
- The explicit return type annotation (`Promise<...>`) makes TypeScript catch handler/schema mismatches at compile time.

## 204 No-Content Routes

```ts
app.delete(
  '/conventions/:id',
  {
    schema: {
      params: IdParams,
      response: { 204: z.void() },
    },
  },
  async (req, reply) => {
    await service.deleteOne(req.params.id, (await getContext(app.container, req)).workspaceId);
    reply.status(204);
  },
);
```

## Checklist

When writing or reviewing a route handler:

| Check | Why |
|---|---|
| `response` key present in `schema` | Without it Fastify bypasses serialization |
| Response schema imported from `vendor/shared/contracts/` | Keeps client and server contract aligned |
| Handler return type annotated explicitly | Catches shape mismatches at compile time |
| No `jsonb` / raw DB row returned directly | DB rows may have more fields than the contract |

## Common Mistakes

| Mistake | Effect |
|---|---|
| `schema: { params, body }` — no `response` | Extra DB fields (e.g. `embedding`, internal flags) sent to client |
| Inline ad-hoc Zod object instead of shared contract | Contract drift — client types don't match |
| No return type annotation on handler | TypeScript infers `unknown`, masks shape mismatch |
| Returning the full Drizzle row object | Leaks DB internals; breaks when schema changes |
