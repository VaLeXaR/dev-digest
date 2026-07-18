# Evals — onion-architecture-node

Regression evals that ship **with** the skill, so delivering the skill delivers its own
quality gate. The runner and CI wiring live separately in the top-level [`skill-evals/`](../../../../skill-evals/)
package — this folder holds only the **test data**.

## Contents

| Path | What it is |
| --- | --- |
| `evals.json` | The test cases: id, name, prompt, expected_output, and the fixture paths each touches. |
| `ground-truth.md` | The grading key — 7 planted violations (V1–V7) + 3 negative controls (N1–N3). Not shown to the model under test. |
| `fixtures/mini-backend/` | A DevDigest-shaped backend with the violations planted in real code. **Intentionally broken TS** (unresolved SDK imports, deliberate rule breaks) with **no hint comments**. |

## Why the fixtures don't break the build

`.claude/` is outside every package's `tsconfig` include and every vitest glob, so these files
are never compiled or linted by the `server` / `client` / `reviewer-core` / `e2e` suites. They
are data, read as text by the eval runner — not source.

**Keep it that way:** never add `.claude/**` to a package tsconfig, and never `import` a fixture
from product code.

## The measurement

Each case runs twice — **with the skill in context** and a **no-skill baseline** (same prompt,
told to rely on its own knowledge and not invoke any Skill tool). Grading is **recall** (finds the
planted violation) and **precision** (does not flag a negative control).

**What iteration 2 taught us (read before adding cases).** On a strong model, *whole-tree* reviews
barely separate the two arms: the baseline found all 7 planted violations and kept the controls
clean, because the sibling ports + container leak the intended architecture, so an unguided model
infers the onion rules. The skill's measurable value concentrates in **conventions and exceptions
that cannot be derived from code** — e.g. eval-4 (repo-intel is an allowed exception): with-skill
2/2, baseline 0/2 (it false-positives "violation"). So new cases should be single-file
convention/exception traps, marked `discriminates: true`, not more whole-tree detection.

Two measurement flags exist because a naive baseline is not actually blind (see the skill-evals
runner README): `single_file` / `no_explore` bar the baseline from inferring the answer by reading
siblings, and `baseline_strip_project_context` runs the baseline without the repo's `CLAUDE.md`
(which itself encodes DevDigest architecture). The iter-2 shared-sync eval was contaminated for
lack of these and is corrected to single-file + no-explore.

## Adding a case

1. Add a fixture (or reuse one) under `fixtures/`. No comments that reveal the planted issue.
2. Record the truth in `ground-truth.md`.
3. Append the case to `evals.json`.
4. Run it via the runner in `skill-evals/` (see that package's README).
