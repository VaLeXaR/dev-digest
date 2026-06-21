# Next.js App Router Organization

## App Router Conventions Used in This Project

| Convention | Where | Purpose |
| --- | --- | --- |
| `page.tsx` | Route segment | Thin entry point — mounts shell + delegates to `_components/` |
| `layout.tsx` | Root only (`src/app/layout.tsx`) | Providers, fonts, global CSS — **does not re-render on navigation** |
| `template.tsx` | Rare | Like `layout.tsx` but **re-renders on every navigation** — use for per-page animations or analytics |
| `error.tsx` | Deep routes | Error boundary (must be `"use client"`) |
| `not-found.tsx` | Route or root | 404 UI for `notFound()` calls within the segment |
| `loading.tsx` | Slow routes | Suspense skeleton shown during navigation |
| `_components/` | Inside route segment | Private: invisible to the router, scoped to that route |

**Colocation safety** — a route segment folder becomes publicly accessible **only** when it contains a `page.tsx` or `route.ts`. Every other file colocated in that folder (components, helpers, styles) is invisible to the router and never sent to clients. Private `_folder` prefixes are not required for safety — they are a convention for explicitness and to avoid future naming conflicts with Next.js special file conventions.

**`page.tsx` must stay thin.** If it exceeds ~40 lines or contains hooks beyond data-fetching, extract a `<FeatureView>` container:

```text
repos/[repoId]/pulls/[number]/
  page.tsx                     ← 10-15 lines: mount AppShell, pass params
  _components/
    PrDetailView/              ← owns all hooks, state, tab management
      PrDetailView.tsx
      index.ts
```

---

## Route Groups `(folder)`

Wrap a folder in parentheses to **organize routes without affecting the URL**:

```text
app/
├── (auth)/
│   ├── login/page.tsx         → /login
│   └── register/page.tsx      → /register
├── (app)/
│   ├── repos/page.tsx         → /repos
│   └── agents/page.tsx        → /agents
```

Use route groups for:

- Applying different layouts to sections without URL nesting
- Grouping by team or domain concern
- Keeping the `app/` root manageable as routes grow
- **Scoping `loading.tsx` to a specific route** — wrap the route in a group and put `loading.tsx` inside; other sibling routes won't inherit it
- **Creating multiple root layouts** — remove the top-level `layout.tsx` and add one per group; each must include `<html>` and `<body>` tags

**Pitfalls:**

- Multiple **root** `layout.tsx` files trigger a full page reload when navigating across groups — use sparingly.
- Two groups must not resolve to the same path (`(a)/repos` + `(b)/repos` → conflict at build time).

---

## utils vs lib vs helpers — This Project's Distinction

This project has **no `src/utils/` folder**. Use the following instead:

| Name | What goes here | Example files |
| --- | --- | --- |
| Colocated `helpers.ts` | Domain-aware pure functions that know your data shapes | `formatPrStatus()`, `groupFindingsBySeverity()` |
| `src/lib/` | Tech wrappers — API client, SDK adapters, providers, context, theme | `api.ts`, `providers.tsx`, `github-urls.ts`, `toast.tsx` |
| `src/lib/hooks/` | Shared React Query + business logic hooks used by ≥2 routes | `useAgents.ts`, `useReviews.ts`, `usePulls.ts` |

**When to use each:**

```text
Is the function React-stateful (uses hooks)?
  YES → src/lib/hooks/<domain>.ts
  NO  → Does it know app-specific data shapes (PR, Agent, Finding)?
          YES → Colocated helpers.ts next to the component
          NO  → Is it needed in 3+ unrelated features?
                  YES → src/lib/ (name the file by its domain: github-urls.ts)
                  NO  → Keep it inline or in the nearest helpers.ts
```

---

## Business Logic Placement

| Logic type | Where it lives |
| --- | --- |
| API calls + React Query state | `src/lib/hooks/<domain>.ts` |
| Pure data transforms (format, sort, filter, group) | Colocated `helpers.ts` |
| UI state (open/close, selected tab, filter value) | Component that owns the UI |
| Derived values from props/state | Inline during render — NOT `useState` + `useEffect` |
| UI primitives with no logic | Presentational component — receives props, renders only |
| Fetches data + passes to presentational children | Container component in `_components/` |

**Hard rules:**

- **NEVER** call `api.get()` / `fetch()` directly in a component body.
- **NEVER** store derived values in `useState` — compute them during render.
- Business transforms (sorting, filtering, grouping) belong in `helpers.ts`, not embedded in JSX map chains.

---

## Server Actions

This project's mutations currently go through the API server (`src/lib/api.ts`) rather than Next.js server actions, but when server actions are introduced:

**Where to place them:**

- Colocate with their route or feature: `_lib/reviews.actions.ts` or `features/reviews/actions/`.
- A central `lib/actions/` becomes unmanageable past ~20 actions.

**Keep them thin:** validate input → call a service → handle the response. Push real business logic into a `services/` layer so it's unit-testable without Next.js internals.

**Server actions vs. route handlers:**

| | Server actions | Route handlers (`route.ts`) |
| --- | --- | --- |
| Use for | UI-triggered mutations (form submits, button clicks) | External clients, webhooks, mobile apps |
| Called by | React Server Components, Client Components | Any HTTP client |
| Auth context | Inherited from request | Must be validated explicitly |

---

## Feature-Driven Architecture (at Scale)

When a feature grows large enough that `_components/` feels crowded, promote it to a self-contained feature folder under `src/features/`:

```text
src/features/reviews/
├── actions/    ← server actions (thin: validate → service → respond)
├── api/        ← React Query hooks and fetchers
├── components/ ← feature UI components
├── hooks/      ← client-side hooks
├── lib/        ← pure utils / business logic (testable without React)
├── schemas/    ← Zod schemas for this feature
├── types/      ← TypeScript types
└── index.ts    ← public surface (only what other features need)
```

Each feature exposes a public API via `index.ts`; other features import from the index, never from internal files. This keeps cross-feature dependencies visible and manageable.

---

## Styling Convention

This project uses **`CSSProperties` objects**, not Tailwind. The pattern:

```ts
// styles.ts — colocated in the component folder
import type { CSSProperties } from "react";

export const s = {
  container: { display: "flex", gap: 8 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
};
```

```tsx
// Component.tsx
import { s } from "./styles";
<div style={s.container}>
```

**Never** create inline object literals in JSX (`style={{ display: "flex" }}`): they recreate a new object reference on every render. Extract to `styles.ts` or a module-level `const`.
