# onion-architecture-node

**Version:** 1.1.0 · **Scope:** `server/` (Fastify + Drizzle + Postgres) and `reviewer-core/` (pure domain core)

AI skill that enforces onion / ports-and-adapters layering for the DevDigest backend.

- **Out of scope:** `client/` frontend — use `react-frontend-architecture` / `react-best-practices`.
- **Grounded in:** `server/AGENTS.md`, `server/README.md`, `server/INSIGHTS.md`, `reviewer-core/AGENTS.md`, `server/src/platform/container.ts`, `server/src/vendor/shared/adapters.ts`, `server/tsconfig.json`.

## What It Covers

- Layer roles and dependency rules for Fastify + Drizzle + TypeScript
- `reviewer-core/` as the pure domain core (no I/O)
- `@devdigest/shared` as the Ports / Contracts layer
- Canonical folder structure with **real DevDigest file paths**
- Tool → Port → Adapter mapping for all external integrations
- `dependency-cruiser` gate that enforces the dependency rule in CI
- Known drift, severity rationale (error vs warn ratchet), exception ledger
- TypeScript patterns for ports, repositories, services, composition root

## Files

| File | Purpose |
| --- | --- |
| [SKILL.md](SKILL.md) | Entry point — the one rule, ring diagram, layer map, decision framework, dependency recipe, enforcement, known drift |
| [layer-map.md](layer-map.md) | 6 layers mapped to real files, tool→port→adapter table, "where does it go?" cheatsheet |
| [enforcement.md](enforcement.md) | `.dependency-cruiser.cjs` config, npm scripts, severity rationale, exception ledger, TypeScript code patterns |
| [README.md](README.md) | This file — background, grounded-in files, reading list |

## Background

Onion Architecture (Palermo, 2008) organises code into concentric rings where dependencies flow inward only:

```
┌─────────────────────────────────┐
│  Transport (Fastify routes)     │
│  ┌───────────────────────────┐  │
│  │  Infrastructure (Drizzle) │  │
│  │  ┌─────────────────────┐  │  │
│  │  │  Application (svc)  │  │  │
│  │  │  ┌───────────────┐  │  │  │
│  │  │  │  Ports (iface)│  │  │  │
│  │  │  │ ┌───────────┐ │  │  │  │
│  │  │  │ │   Core    │ │  │  │  │
│  │  │  │ └───────────┘ │  │  │  │
│  │  │  └───────────────┘  │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

The key invariant: **nothing in an inner ring references anything in an outer ring.**

## Reading List

### Onion / Clean Architecture (canon)

- [The Onion Architecture — Jeffrey Palermo (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — Original series (parts 1–4)
- [Onion Architecture — Herberto Graça (Software Architecture Chronicles)](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85)
- [The Clean Architecture — Uncle Bob (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [DDD, Hexagonal, Onion, Clean, CQRS — Herberto Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)

### Ports & Adapters in Node.js / TypeScript

- [Domain-Driven Hexagon — Sairyss (GitHub, 27k★)](https://github.com/Sairyss/domain-driven-hexagon) — Ports & adapters with full TS examples; influenced our port-naming rules
- [Clean Node.js Architecture — Khalil Stemmler](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Hexagonal & Clean Architecture with examples — dyarleniber](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Ports and Adapters — Carlos Cunha](https://betterprogramming.pub/how-to-ports-and-adapter-with-typescript-32a50a0fc9eb)
- [Future-Proof Your Code: Ports & Adapters — Alex Rusin](https://blog.alexrusin.com/future-proof-your-code-a-guide-to-ports-adapters-hexagonal-architecture/)
- [Implementing Onion Architecture in Node.js/TS — Remo Jansen](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad)

### dependency-cruiser (forcing the boundaries)

- [dependency-cruiser — npm](https://www.npmjs.com/package/dependency-cruiser) — Official docs; RE2 syntax, `forbidden` rule schema
- [Validate Dependencies According to Clean Architecture — Ken Miyashita](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) — Direct inspiration for our gate
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [Dependency Cruiser: Restrict Imports in JavaScript — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/)

### Fastify (layering / encapsulation)

- [Fastify — Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
- [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [Build Production-Ready APIs with Fastify — Strapi](https://strapi.io/blog/build-production-ready-apis-with-fastify)

### Drizzle ORM / Repository Pattern

- [Repository Pattern with Drizzle ORM — vimulatus](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Atomic Repositories in Clean Architecture — Sentry Blog](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- [cosmicpython — Repository Pattern](https://www.cosmicpython.com/book/chapter_02_repository)

## Changelog

- **1.1.0** (2026-06-21) — Added: `reviewer-core` as Core layer, `@devdigest/shared` as Ports layer, 6-layer diagram with real DevDigest paths, decision framework with real file paths, "add new external dependency" recipe, full `dependency-cruiser` gate (`.dependency-cruiser.cjs` config + npm scripts + severity rationale + ratchet concept + exception ledger), known drift documentation, tool→port→adapter table, "where does it go?" cheatsheet. Expanded sources from 10 to 18 with categories. Grounded-in section added.
- **1.0.0** (2026-06-18) — Initial release: 4-layer generic model, TypeScript code patterns, common violations table, composition root rules.
