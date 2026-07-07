# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [onion-architecture-node](onion-architecture-node/SKILL.md) | Backend | 4-layer Onion Architecture for Fastify + Drizzle + TypeScript modules |
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-frontend-architecture](react-frontend-architecture/SKILL.md) | Frontend | Where files/components/hooks/constants/utils/helpers live in a React/Next.js project |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Shared | Append non-obvious discoveries to module INSIGHTS.md during sessions |
| [pr-self-review](pr-self-review/SKILL.md) | Shared | Local pre-PR gate: deterministic checks → domain skill routing → adversarial CRITICAL verification → merge block |
| [spec-clarification](spec-clarification/SKILL.md) | Shared | Interview the requester one-at-a-time about `[NEEDS CLARIFICATION]` markers and design gaps in a draft `SPEC-<DATE>` file |
| [grilling](grilling/SKILL.md) | Shared | Interview the requester one-at-a-time about open questions in a Development Plan before any `implementer` is dispatched |
| [sdd](sdd/SKILL.md) | Shared | `/sdd` — orchestrates the full Spec-Driven Development pipeline end to end (spec → plan → build → verify), with an architecture-review fix-iterate loop |
| [run-plan](run-plan/SKILL.md) | Shared | `/run-plan docs/plans/<name>.md` — build+verify only: implementer → plan-verifier → architecture-reviewer (fix-iterate loop) → final plan-verifier gate, for a plan already approved and grilled by hand |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
