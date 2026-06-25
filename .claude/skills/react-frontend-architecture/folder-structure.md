# Folder Structure & Component Nesting

## Structure Strategies (Scale to Size)

Pick the lightest structure that fits; let it evolve as real code reveals the seams.

**1. Flat** — small apps / prototypes (<15–20 components). Everything under `src/` with minimal folders. Breaks down once `components/` becomes a wall of files.

**2. Type-based** — small/medium. Group by technical role:

```text
src/
├── components/   hooks/   pages/
├── services/     utils/   contexts/
```

Simple and discoverable, but a single feature scatters across many folders and `components/` bloats as it grows.

**3. Feature-based** — medium/large. Each feature is self-contained; type-based organization lives *inside* each feature. Expose a public API via `index.ts`.

```text
src/
├── features/
│   └── reviews/
│       ├── components/   hooks/   api/   types/   utils/   index.ts
├── components/   # shared UI primitives
├── hooks/  lib/  constants/   # genuinely shared
```

High cohesion — delete a feature → delete a folder. Cost: the "shared vs feature-specific" boundary needs judgment.

**Feature-based vs. type-based:**

| | Type-based | Feature-based |
| --- | --- | --- |
| Mental model | organize by *what it is* | organize by *what it does* |
| Best for | small apps, beginners | growing apps, teams |
| Weakness | features scatter; `components/` bloats | "shared vs local?" boundary is fuzzy |
| Deleting a feature | hunt across folders | delete one folder |

**Starting point when unsure:** `components/`, `hooks/`, `lib/`. Add folders as the codebase asks for them.

---

## Top-Level Folder Map (This Project)

```text
client/src/
  app/                          Next.js App Router routes
    <route>/
      page.tsx                  Thin entry point — minimal logic, calls hooks
      layout.tsx                Route layout (optional)
      error.tsx                 Error boundary for this route
      loading.tsx               Suspense skeleton for this route
      _components/              Private: used only by this route + children
        <Feature>/
          <Feature>.tsx
          constants.ts
          helpers.ts
          styles.ts
          index.ts              Barrel re-export
          <Feature>.test.tsx
  components/                   Shared: used by ≥2 routes
    <domain>/
      <Component>/
        <Component>.tsx
      constants.ts
      helpers.ts
      styles.ts
      index.ts
  lib/                          Tech layer: client, providers, context, theme
    hooks/                      Shared stateful / data-fetching hooks
    api.ts
    providers.tsx
  vendor/
    ui/                         @devdigest/ui — reuse only, never recreate
    shared/                     @devdigest/shared — Zod contracts, never edit
```

---

## Real Project Example

```text
src/
  app/
    agents/
      _components/                  ← used by /agents and its children
        AgentCard/
          AgentCard.tsx
          constants.ts
          helpers.ts
          index.ts
          AgentCard.test.tsx
      [id]/
        _components/                ← used only by /agents/[id]
          AgentEditor/
            AgentEditor.tsx
            index.ts
            _components/            ← subcomponents of AgentEditor
              ConfigTab/
                ConfigTab.tsx
                constants.ts
                styles.ts
                index.ts
  components/
    diff-viewer/                    ← shared across /pulls/[number] and others
      DiffViewer/
        DiffViewer.tsx
        index.ts
      FileCard/
        FileCard.tsx
        index.ts
      constants.ts
      helpers.ts
      styles.ts
  lib/
    hooks/
      agents.ts
      reviews.ts
      repos.ts
    api.ts
    providers.tsx
    toast.tsx
```

---

## Nesting Rules

1. **`_components/` prefix** — Next.js App Router private folder; cannot be navigated to as a route.
2. **Each component is a folder** — `<Name>/<Name>.tsx` + `index.ts` + optional colocated files.
3. **Depth limit** — At most 3 levels of `_components/` nesting. If you need a 4th level, the component tree is too deep — split into sibling features.
4. **Barrel `index.ts`** — Exports only the public API of the folder. Internal sub-components that are not consumed outside the folder are NOT re-exported.

---

## Colocation

> "Place code as close to where it's relevant as possible." — Kent C. Dodds

- Keep tests, styles, sub-components, and helpers next to the code they serve.
- Colocate **state** too: when state is lifted higher than needed, every update invalidates the entire React subtree below it. A slow sibling component will re-render on every keystroke in an unrelated input. Keep state in the smallest scope where all consumers can access it.
- Promote upward only when a real second consumer appears, and only to the **lowest common ancestor** — don't hoist a component-specific helper to `src/lib/`.
- **Premature extraction to `utils/` creates orphaned, unused code.** Keep utility functions close to their initial use case; promote only when genuinely shared.

**The colocation decision:**

```text
Is this file used by more than one component/route?
  NO  → colocate it next to its only consumer
  YES → promote to the lowest common ancestor folder
```

---

## Naming Conventions

| Element | Convention | Example |
| --- | --- | --- |
| Components | `PascalCase` | `ReviewCard` |
| Functions / variables | `camelCase` | `formatPrStatus` |
| Event handlers | `camelCase`, `handle`/`on` prefix | `handleSubmit`, `onTabChange` |
| Custom hooks | `camelCase`, `use` prefix | `useReviewRun` |
| Constants | `UPPER_SNAKE_CASE` | `POLL_INTERVAL_MS` |
| Types / interfaces | `PascalCase` | `ReviewRun`, `FindingGroup` |
| Booleans | `is`/`has`/`should` prefix | `isLoading`, `hasFindings` |
| Supporting files | suffixes | `.test.tsx`, `.styles.ts`, `.constants.ts` |
| Bundle files | plural | `constants.ts`, `helpers.ts`, `types.ts` |

**Component files:** match component name (`ReviewCard.tsx`, `useReviewRun.ts`). Keep consistent — never mix kebab-case and PascalCase in the same project.

---

## Anti-Patterns

- **Deep nesting** — `_components/_components/_components/_components/X` — cap at 3 levels. If you need a 4th, restructure.
- **`components/` with 20+ files and no subdivision** — split into `ui/`, `form/`, or domain folders before it becomes unnavigable.
- **A `utils.ts` / `helpers.ts` "black hole"** — a 1000-line file of unrelated functions. Group by purpose; if you can't name what a helper belongs to, it wants a feature folder.
- **Hoisting component-local code to `src/`-level** before it's actually reused by a second consumer.
- **Relative-path spaghetti** (`../../../`) instead of path aliases (`@/components/...`).
- **Mirroring `src/` with a parallel `__tests__/` tree** — colocate tests next to the code they test.
- **Cross-feature direct imports** — features must never import from each other's internal folders. Route through shared layers or promote to `src/components/`.

**The "Delete Test" (Robin Wieruch)** — a quick boundary check: mentally remove one feature folder and ask what breaks.

- ✅ Only the pages that compose it fail cleanly → boundaries are solid.
- ❌ Multiple other features break or leak internals → shared code isn't in the right layer yet.
