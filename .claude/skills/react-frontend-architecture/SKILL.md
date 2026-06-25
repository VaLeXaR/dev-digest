---
name: react-frontend-architecture
description: "Use when deciding where to put a file, component, hook, constant, or utility in a React/Next.js project. Covers feature vs shared placement, split heuristics, constants scoping, utils/lib/helpers distinctions, composition patterns, naming conventions, custom hook extraction, and business logic placement. Does NOT cover component design rules (see [[react-best-practices]]), Next.js RSC/data-fetching mechanics (see [[next-best-practices]]), or runtime performance."
---

# React Frontend Architecture — File & Folder Reference

Quick-reference for where things live and why.

For component design rules (hooks misuse, state anti-patterns) see [[react-best-practices]].
For Next.js special files (`page.tsx`, `layout.tsx`, RSC, data fetching) see [[next-best-practices]].

---

## Core Principles

1. **No single correct structure.** Scale to project size: flat → type-based → feature-based. Restructure once real code reveals the seams, not upfront.
2. **Colocate by default.** Keep files used together stored together. Promote to shared only when a *second* consumer actually appears.
3. **One reason to change per unit.** If you describe a component or module with "and", split it.
4. **Layer by concern, not by habit.** UI rendering → component; React state/effects/fetching → hook; pure logic → plain function; backend I/O → service. Don't add layers when the logic is trivial.
5. **Shallow over deep.** Cap folder nesting at 3–4 levels. Prefer a longer name over another folder. Use path aliases (`@/…`) instead of `../../../`.
6. **Be consistent, then enforce.** Naming and structure conventions matter less in their specifics than in being applied uniformly. Pick one, lint it.

---

## When This Skill Applies

| Question | Skill |
|----------|-------|
| Where does this component/hook/constant/util go? | **this skill** |
| How do I split this large component or file? | **this skill** |
| Which folder structure should this project use? | **this skill** |
| Where does business logic go (component vs hook vs function)? | **this skill** |
| Is this hook usage or state pattern an anti-pattern? | `react-best-practices` |
| Server vs client component, data fetching, metadata, RSC | `next-best-practices` |

---

## Decision Framework

Apply in order when placing or restructuring code:

1. **Is it used by more than one feature/route?** No → colocate next to its only consumer. Yes → move to shared (`src/components/`, `src/lib/`) at the lowest common ancestor.
2. **Is it routable (Next.js)?** Only `page.tsx`/`layout.tsx`/`error.tsx`/`loading.tsx` are routes. Everything else colocated under `app/` goes in a `_folder` or a non-route file.
3. **What kind of code is it?** Map to its layer (principle 4) before picking a folder.
4. **Is the file getting large (>~200 lines) or doing >1 thing?** Extract: constants → `constants.ts`, helpers → `helpers.ts`, stateful logic → custom hook, sub-UI → child component.
5. **Could this folder grow past ~15–20 files?** Subdivide now (`components/ui` vs `components/form`, or switch to feature folders).

---

## Quick Folder Lookup (CRITICAL)

| I need to place a… | It goes in… |
|--------------------|-------------|
| Component used only by one route | `src/app/<route>/_components/<Name>/` |
| Component used by ≥2 routes | `src/components/<domain>/<Name>/` |
| Shared data-fetching hook | `src/lib/hooks/<domain>.ts` |
| API client / provider / context | `src/lib/` |
| Domain-specific formatting / transform | Colocated `helpers.ts` next to the component |
| Cross-feature pure utility | `src/lib/` (only if used in 3+ unrelated features) |
| UI primitive | `src/vendor/ui/` — reuse, do not recreate |
| Zod contract shared with server | `src/vendor/shared/` — never edit here |

**Promotion rule:** start inside route `_components/`; move to `src/components/` only when a second route needs it.

---

## Details

- **Folder structure, scale strategies, colocation, naming, anti-patterns** → [folder-structure.md](folder-structure.md)
- **When to split + composition techniques + constants + barrel exports + custom hook extraction** → [component-organization.md](component-organization.md)
- **Next.js organization + utils/lib/helpers + business logic + route groups + server actions** → [next-organization.md](next-organization.md)
