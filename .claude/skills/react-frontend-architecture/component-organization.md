# Component Organization

## When to Split a Component

A component should have **one reason to change**.

Split when **any** of these signals appear:

| Signal | Action |
| --- | --- |
| You describe it with "and" — "renders list AND manages modal" | Split into two components |
| State is only used in a subtree | Push state down; extract child |
| File exceeds 200 lines | Extract a subcomponent |
| A visual block appears in 2+ places | Extract; colocate at nearest common ancestor |
| A section has no dependency on parent state | Extract as sibling or child |
| A `page.tsx` exceeds ~40 lines of logic | Extract a `<FeatureView>` container in `_components/` |

**Do not split** when:

- The extracted component would have only one caller and no independent state.
- The split makes prop drilling worse than the size violation.

---

## Composition Techniques

**1. Extract real sub-components** — promote chunks of JSX to named components. Do not use inline sub-render methods (they keep state and props tangled in the parent's closure).

**2. Separate fetching from presentation** — a hook fetches and transforms; a presentational component renders the data it's handed and knows nothing about fetching:

```tsx
// Good: fetching in a hook, rendering in a dumb component.
function ReviewPanel({ id }: { id: string }) {
  const { data, isLoading } = useReview(id);
  if (isLoading) return <Spinner />;
  return <ReviewView review={data} />;   // pure presentation
}
```

**3. `children` / slot props** — pass elements (not just data) to build flexible layout components. Reserve `children` for the main content area; use named element props for named slots:

```tsx
// Layout component owns arrangement; callers own content.
<SplitPane left={<FileTree />} right={<DiffView />} />
```

**4. HOCs** — only for genuinely cross-cutting, generic concerns (auth gating, theming). Prefer hooks and composition first. If you reach for a HOC, ask whether a custom hook solves the same problem.

**Container / presentational pattern** — a container component wires data and handlers and passes them down to a presentational component. Custom hooks mostly replace the container, but the pattern is still valid when you need an explicit seam for testing.

---

## Extracting Custom Hooks

Custom hooks are the primary tool for moving stateful logic *out* of components.

**When to extract:**

- Repeated `useState`/`useEffect` clusters across 2+ components.
- An Effect that synchronizes with an external system — wrap it so the data flow is explicit (`url in → data out`) and callers can't bolt on unrelated dependencies.
- The component reads as implementation detail instead of intent: you see `const [data, setData] = useState()` before you understand what the component *does*.
- The component is hard to unit test — "a component that is untestable or hard to test is most likely badly designed" (Pavlutin). Extracting the logic into a hook makes both testable independently.

**When NOT to extract:**

- Don't abstract early. A longer component function is fine; extract when real duplication or genuine complexity appears.
- Don't create grab-bag hooks like `useMount` or `useComponentState` — keep one concern per hook.
- If the hook would have only one caller and no independent test value, keep the logic inline.
- If a component has only a few lines of JS, separation isn't necessary — don't over-engineer trivial logic.

**The name test** — if you can't give the hook a clear, self-explanatory name, it's too coupled to extract yet. A good name lets a reader guess what the hook takes and returns: `useReviewRun`, `useOnlineStatus`, `usePullFindings`.

**The `use` prefix rule** — only functions that *call hooks* get the `use` prefix. Pure functions that don't call hooks must NOT use `use`, even if they transform the same data:

```ts
// ❌ Wrong: pure sort function doesn't call any hook
function useSorted(items: Item[]) { return items.slice().sort(); }

// ✅ Correct: regular function, callable conditionally
function getSorted(items: Item[]) { return items.slice().sort(); }
```

**Lifecycle wrapper anti-patterns** — never create hooks that hide the React lifecycle:

```ts
// ❌ All of these — don't create them
function useMount(fn: () => void) { useEffect(() => fn(), []); }
function useEffectOnce(fn: () => void) { useEffect(() => fn(), []); }
```

Why they're harmful: they don't react to prop changes, they suppress linter dependency warnings, and they push components into imperative thinking. Call `useEffect` directly.

**Sharing logic ≠ sharing state** — each hook call gets its own independent state. Two components calling `useReviewRun(id)` each get their own `isLoading`, `data`, etc. They re-sync because they subscribe to the same source, not because they share a variable.

**Placement:**

```text
Is the hook used by more than one component?
  NO  → colocate next to its only consumer
        e.g. AgentEditor/useAgentForm.ts
  YES → promote to src/lib/hooks/<domain>.ts
```

---

## Constants: Scoping Rules

| Scope | Location |
| --- | --- |
| Used only in one component | Top of that component's `.tsx` file — `const THING = ...` before the function |
| Used by 2+ files in one feature | `_components/<Feature>/constants.ts` |
| Used across multiple routes/domains | `src/components/<domain>/constants.ts` |

**Always:**

- `UPPER_SNAKE_CASE` for value-set constants
- `as const` for union-typed sets (so TypeScript infers the literal type, not `string`)
- Never hardcode magic strings or numbers inline in JSX — name them

```ts
// constants.ts
export const STRATEGY_VALUES = ["full_diff", "file_by_file", "hierarchical"] as const;
export type ReviewStrategy = (typeof STRATEGY_VALUES)[number];
export const POLL_INTERVAL_MS = 4000;
```

---

## Barrel `index.ts` Pattern

Every component folder gets an `index.ts` that re-exports only the public surface:

```ts
// src/components/diff-viewer/DiffViewer/index.ts
export { DiffViewer } from "./DiffViewer";
```

**Rules:**

- Re-export the component by name — not as `default` (named exports survive refactors).
- Do NOT re-export internal helpers, sub-components, or types that callers never need.
- Callers import from the folder, not the file: `import { DiffViewer } from "../DiffViewer"`.

---

## Colocated Files Per Component Folder

| File | Purpose | Required? |
| --- | --- | --- |
| `<Name>.tsx` | The component | Always |
| `index.ts` | Barrel re-export | Always |
| `constants.ts` | Magic values, config | When needed |
| `helpers.ts` | Pure domain transforms | When needed |
| `styles.ts` | `CSSProperties` objects | When needed (this project uses `CSSProperties`, not Tailwind) |
| `<Name>.test.tsx` | Vitest + RTL tests | For non-trivial components |
| `types.ts` | Local TS types | Only if too large for the component file |

Keep all these in the **same folder** as the component. Never scatter them across separate top-level `constants/`, `types/`, or `helpers/` folders.
