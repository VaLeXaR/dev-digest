# Design: Auto-generate risks alongside intent

**Date:** 2026-06-26
**Branch:** l-03-home-work

## Problem

Risk areas in the Intent panel require a separate "Generate" button click after intent is
already generated. Users must press two buttons to see a complete Intent brief.

## Goal

When intent is generated (initial or recalculate), risks are generated automatically as part
of the same action. No separate button needed.

## Approach: Route-level orchestration (server-side)

The `POST /pulls/:id/intent/generate` route handler becomes the orchestrator — it runs both
`IntentService.generate()` and `RisksService.generate()` in parallel via `Promise.all()`.
Services remain fully decoupled (neither imports the other). The response contract is
unchanged: returns `PrIntentRecord`. Risks are a side effect written to the DB.

The standalone `POST /pulls/:id/risks/generate` endpoint is preserved for future standalone
recalculation.

## Affected files (4)

| File | Change |
|---|---|
| `server/src/modules/intent/routes.ts` | Instantiate `RisksService`; `Promise.all` both `.generate()` calls in the POST handler |
| `client/src/lib/hooks/brief.ts` | `useRecalculateIntent.onSuccess` also invalidates `["risks", prId]` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | Remove `useGenerateRisks` call and the "Generate" button from the empty-risks state |
| `client/messages/en/prReview.json` | Update `emptyRisks` copy to remove reference to the Generate button |

## Constraints

- No new routes, no schema changes, no new contracts
- `useGenerateRisks` hook stays exported from `brief.ts` (endpoint still exists), just not used in `OverviewTab`
- Empty-risks state (edge case: risks LLM failed) shows a message only; "Recalculate" covers regeneration

## Data flow after change

```
User clicks "Recalculate"
  → POST /pulls/:id/intent/generate
      → Promise.all([
          IntentService.generate()  // LLM call A
          RisksService.generate()   // LLM call B (parallel)
        ])
      → upsertIntent + upsertRisks (both written)
      → returns PrIntentRecord
  → onSuccess: invalidate ["intent", prId] + ["risks", prId]
  → UI refetches both → full brief rendered immediately
```
