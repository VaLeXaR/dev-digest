# react-frontend-architecture

**Version:** 1.1.0 · **Scope:** Frontend (React / Next.js) · **Project:** DevDigest `client/`

AI skill that answers "where does this file go?" for the DevDigest React/Next.js frontend.

## Focus

Decide **where frontend code lives** and **how it is structured** — the "which file/folder does this belong in, and how do I split it?" question. Deliberately about architecture and organization, **not** runtime performance, not a React anti-pattern catalog, not Next.js rendering mechanics.

## What It Covers

| Area | File |
| --- | --- |
| Core principles + decision framework + skill boundary routing | [SKILL.md](SKILL.md) |
| Structure strategies (flat/type/feature), colocation, naming, anti-patterns | [folder-structure.md](folder-structure.md) |
| Splitting components (SRP/composition), hook extraction, constants, barrel exports | [component-organization.md](component-organization.md) |
| Next.js App Router org (route groups, private folders, business logic, server actions, feature-driven) | [next-organization.md](next-organization.md) |

## Intended Use Cases (Triggers)

- "Where should I put this component / hook / constant / util / type?"
- "How do I split this large component or file?"
- "Where does business logic go?" (component vs hook vs pure function vs service)
- "Should this be in `lib/`, `helpers.ts`, or `utils/`?"
- Organizing a Next.js App Router app: route groups, private `_folders`, where server actions belong
- File and component naming decisions

## Relationship to Other Skills

| Skill | Owns | Defer to it when… |
| --- | --- | --- |
| **react-best-practices** | React anti-patterns, hooks rules, state correctness | the question is "is this usage correct?" not "where does it go?" |
| **next-best-practices** | RSC boundaries, data fetching, metadata, async APIs | the question is "server vs client / how to fetch" not "which folder" |
| **typescript-expert** | Type-level programming, tooling, migrations | the question is about types themselves, not module placement |
| **react-testing-library** | How to write component/hook tests | writing the tests, not where test files live |

**Boundary in one line:** this skill places code; the others implement it. Use them together on mixed tasks.

## Sources

### Folder & Project Structure

- [React Folder Structure Best Practices \[2026\] — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/) — Canonical multi-strategy progression from flat to feature-based
- [Bulletproof React — Folder Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — Feature-based colocation pattern; influenced the "promote when shared" rule
- [Screaming Architecture: Evolution of a React Folder Structure — profy.dev](https://profy.dev/article/react-folder-structure) — Business-domain-first naming argument
- [How to Structure a React Project in 2025 — DEV (algo\_sync)](https://dev.to/algo_sync/how-to-structure-a-react-project-in-2025-clean-scalable-and-practical-15j6)
- [File Structure — React (legacy docs)](https://legacy.reactjs.org/docs/faq-structure.html) — Official: "there is no single right answer"

### Business Logic & Separation of Concerns

- [Separation of Concerns with React Hooks — Felix Gerschau](https://felixgerschau.com/react-hooks-separation-of-concerns/) — Data-flow model: component → hook → pure function → service
- [Path To A Clean(er) React Architecture pt.6 — Business Logic Separation — profy.dev](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- [Separating Business Logic from UI Components in React 18 — Bootcamp](https://medium.com/design-bootcamp/separating-%EF%B8%8F-business-logic-from-ui-components-in-react-18-aa1775b3caba)

### Splitting Components (SRP & Composition)

- [7 Architectural Attributes of a Reliable React Component — Dmitri Pavlutin](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/) — Single-responsibility signals and composition rules
- [Techniques for Decomposing React Components — David Tang (DailyJS)](https://medium.com/dailyjs/techniques-for-decomposing-react-components-e8a1081ef5da) — Slot props, render props, container/presentational seam
- [React docs — Thinking in React](https://react.dev/learn/thinking-in-react) — Component hierarchy and state ownership principles

### Custom Hooks (Extraction)

- [Reusing Logic with Custom Hooks — react.dev (official)](https://react.dev/learn/reusing-logic-with-custom-hooks) — Canonical reference for when and how to extract
- [Refactoring Components in React with Custom Hooks — CodeScene](https://codescene.com/blog/refactoring-components-in-react-with-custom-hooks) — Practical extraction workflow
- [Best Practices for Creating Reusable Custom Hooks — DEV (hasancse)](https://dev.to/hasancse/best-practices-for-creating-reusable-custom-hooks-in-react-37nj) — Name test, single-concern rule

### Constants, Utils & Helpers

- [Delightful React File/Directory Structure — Josh W. Comeau](https://www.joshwcomeau.com/react/file-structure/) — Arguments for domain-specific helpers over a generic utils barrel
- [How to Improve Your ReactJS Code with Constants — Bomberbot](https://www.bomberbot.com/reactjs/how-to-improve-your-reactjs-code-with-constants-an-expert-guide/) — Magic value extraction patterns

### Naming Conventions

- [Naming Conventions in React for Clean & Scalable Code — Sufle.io](https://www.sufle.io/blog/naming-conventions-in-react) — PascalCase/camelCase/UPPER\_SNAKE matrix
- [React Naming Conventions Simplified — GitHub Gist (kamauwashington)](https://gist.github.com/kamauwashington/4396ea26537e0abd94ac7409998870e9)

### Colocation

- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — Core colocation principle and "lowest common level" promotion rule
- [State Colocation Will Make Your React App Faster — Kent C. Dodds](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — Why state colocation reduces re-renders

### Next.js App Router Organization

- [Getting Started: Project Structure — Next.js (official)](https://nextjs.org/docs/app/getting-started/project-structure) — Official guidance on `_components/`, route groups, and file co-location
- [Project Organization and File Colocation — Next.js docs](https://nextjs.org/docs/13/app/building-your-application/routing/colocation) — Colocation safety and private folders
- [Next.js Colocation Template — arhamkhnz](https://github.com/arhamkhnz/next-colocation-template) — Live reference for route group and private folder patterns
- [The Next.js Directory Structure That Scales: Technical Layer First — Bitsmiths](https://bitsmiths.studio/blogs/nextjs-directory-structure) — Feature-first vs. layer-first comparison
- [Feature Driven Architecture (FDA) for Next.js — Julien Mauclair](https://medium.com/@JMauclair/feature-driven-architecture-fda-a-scalable-way-to-structure-your-next-js-applications-b8c1703a29c0) — `features/` layout with `actions/`, `api/`, `schemas/` sub-folders

## Changelog

- **1.1.0** (2026-06-21) — Added: core principles, decision framework, scale strategies, colocation section, naming conventions table, anti-patterns, composition techniques, custom hook extraction with name test, route groups with pitfalls, server actions guidance, feature-driven architecture structure. Expanded sources from 5 to 25 with categories.
- **1.0.0** (2026-06-18) — Initial release: quick folder lookup, project-specific folder map, split heuristics, constants scoping, barrel exports, utils/lib/helpers distinction, business logic placement, styling convention.
