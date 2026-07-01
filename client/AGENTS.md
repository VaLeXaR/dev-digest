# client — context map (@devdigest/web)

## Before answering

Check [docs/](docs/), [specs/](specs/), and [INSIGHTS.md](INSIGHTS.md) in this module before reading code.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query · next-intl · Vitest + jsdom

## Commands

```sh
pnpm dev       # :4000
pnpm test      # vitest + jsdom (fetch mocked — no API needed)
pnpm typecheck
```

## Conventions

- Pages are thin — feature logic lives in colocated `_components/<Name>/` with their own `*.test.tsx`
- All data hooks: `src/lib/hooks/*` → `src/lib/api.ts` (API base: `NEXT_PUBLIC_API_BASE`)
- i18n strings: `messages/<locale>/*.json` via next-intl
- UI primitives: `src/vendor/ui` (`@devdigest/ui`) — do not publish

## Do-not-touch

- `src/vendor/shared/` — this is `@devdigest/shared`; changes require sync with server

## Read when

- UI route map, which hooks hit which endpoints → [README.md](README.md)
- Browser e2e flows → [../e2e/README.md](../e2e/README.md)
- Test strategy → [../TESTING.md](../TESTING.md)
- Feature specs → [specs/](specs/)
- Accumulated module lessons → [INSIGHTS.md](INSIGHTS.md)
