# reviewer-core — context map (@devdigest/reviewer-core)

## Before answering

Check [docs/](docs/), [specs/](specs/), and [INSIGHTS.md](INSIGHTS.md) in this module before reading code.

## What it is

Pure review engine — no DB, no filesystem, no GitHub.
Only side effect: LLM call through an injected `LLMProvider`.
Does NOT emit JS — `build` = typecheck only.

## Commands

```sh
npm test          # hermetic vitest (stubbed LLM — no keys, no network)
npm run typecheck
```

## Pipeline

`diff → assemblePrompt() → wrapUntrusted() + INJECTION_GUARD → LLMProvider → groundFindings() → Review`

## Conventions

- Grounding is mandatory: a finding without a real line in the diff is dropped, not an error
- Score is recomputed from surviving findings — model's self-reported score is ignored
- Prompt slots (`skills`, `memory`, `specs`, `callers`) are in the signature — server starts passing them from the relevant lesson

## Do-not-touch

- **IMPORTANT:** `grounding.ts` — citation gate; changes affect review integrity for all reviews

## Read when

- Full pipeline, public API, prompt slots → [README.md](README.md)
- How server assembles inputs (section "Review context") → [../server/README.md](../server/README.md)
- Feature specs → [specs/](specs/)
- Accumulated module lessons → [INSIGHTS.md](INSIGHTS.md)
