# skill-evals — runner + CI for skill regression evals

The **basic setup** (harness + CI wiring) for the skill evals. The *test data* (fixtures,
prompts, ground truth) lives with each skill, under `.claude/skills/<skill>/evals/`, so a skill
delivers self-contained. This package only knows how to **run** them.

Modelled on the `e2e/` package: an LLM-driven suite is its own first-class package with its own
runner and its own path-filtered workflow — heavier and gated, not run on every PR.

## Status

Scaffold. The `onion-architecture-node` evals exist and are validated by hand
(`.claude/skills/onion-architecture-node/evals/`); the automated runner below is the next build
once those evals are confirmed to discriminate.

## Intended shape

```
skill-evals/
  package.json          own deps + node_modules (no root workspace here)
  tsconfig.json         include ["lib","run.ts"]; exclude ["**/fixtures/**"]
  run.ts                entrypoint: discover skills' evals/ → run each case ±skill → grade → assert
  lib/
    dispatch.ts         spawn `claude -p` with and without the skill in context
    grade.ts            score a run's output against ground-truth.md (recall + precision)
    aggregate.ts        roll up per-eval + per-config metrics
```

## Discovery contract

The runner globs `.claude/skills/*/evals/evals.json`. For each case it reads `prompt` +
`files`, runs the with-skill and baseline configurations, and grades against the sibling
`ground-truth.md`.

## Measurement discipline (required — learned from the onion iter-2 run)

A "no-skill" baseline is only meaningful if it is genuinely blind. Two leaks were observed and the
runner MUST close both. Each case in `evals.json` may set these flags; honor them:

- `baseline_strip_project_context: true` — launch the **baseline** without the repo's
  `CLAUDE.md`/`AGENTS.md` in context. Those files encode DevDigest architecture (no workspace
  hoisting, `@devdigest/shared` vendoring, layer roles); inheriting them turns a supposedly-blind
  baseline into a half-informed one. (In the iter-2 in-conversation run this could not be enforced,
  so the shared-sync eval was contaminated and read as parity.)
- `single_file: true` — the run may read ONLY the file(s) in `files`; no other fixture source.
- `no_explore: true` — no listing/grep/globbing the fixture tree beyond `files`. Without this, a
  knowledge eval is answerable by discovery (the baseline just finds the second contract copy).
- The **with-skill** arm always reads the skill under test; that is not "project context" and is
  never stripped.

Cases marked `discriminates: false` are kept for coverage but are not expected to separate the two
arms; `discriminates: true` are the ones the gate threshold should weight.

## CI (`.github/workflows/skill-evals.yml`)

- **Trigger:** `workflow_dispatch` + nightly `schedule` (and/or an `evals` PR label) — never on
  every PR. It spends LLM tokens and is non-deterministic, same rationale as `e2e-web.yml`.
- **Path filter:** `skill-evals/**` and `.claude/skills/**`.
- **Gate:** assert a threshold, not exact text — e.g. per skill, *with-skill recall ≥ target,
  precision controls clean, and with-skill ≥ baseline*. A drop below threshold fails the job.
