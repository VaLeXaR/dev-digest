# Ground truth — planted onion violations (grading key — NOT given to agents)

Fixture root: `fixtures/mini-backend/`. Ten files. Seven planted violations, three negative
controls. No hint comments exist in any fixture.

## Planted violations (should be FOUND)

| ID | Rule (skill) | Severity | File | The tell |
| --- | --- | --- | --- | --- |
| V1 | core-is-pure | error | `reviewer-core/src/grounding.ts` | imports `node:fs` (`readFileSync`) and `octokit`; does file + network I/O in the pure core |
| V2 | services-depend-on-ports | error | `server/src/modules/reviews/service.ts` | imports `../../adapters/llm/anthropic` and `new AnthropicProvider(...)` instead of `container.llm()` |
| V3 | routes-are-thin | error | `server/src/modules/repos/routes.ts` | imports `../../adapters/github/octokit`, `new`s the adapter, and holds business filter/map logic |
| V4 | db-confined-to-repositories | warn | `server/src/modules/reviews/routes.ts` | imports `drizzle-orm` + `db/schema` and runs an inline `db.select()` query in a route |
| V5 | adapters-dont-know-modules | error | `server/src/adapters/github/octokit.ts` | imports `../../modules/reviews/service` — infrastructure depending on a feature |
| V6 | no-cross-module-internals | warn | `server/src/modules/repos/service.ts` | imports `../reviews/repository` directly instead of going through `container.*` |
| V7 | port-leak (vendor in shape) | principle | `server/src/vendor/shared/adapters.ts` | `GitHubClient.raw(): Octokit` leaks the SDK; `OpenAIEmbedder` names a vendor in a port |

## Negative controls (should NOT be flagged as violations)

| ID | File | Why it is correct |
| --- | --- | --- |
| N1 | `server/src/platform/container.ts` | composition root — the ONE place allowed to import both ports and concrete adapters and call `new` on them |
| N2 | `server/src/modules/reviews/repository.ts` | repository — the ONLY layer allowed to import `drizzle-orm` + `db/schema` + `db/client` |
| N3 | `reviewer-core/src/scoring.ts` | pure domain: only imports a shared type; no I/O |

## Grading notes

- **Recall** = of V1–V7, how many the run correctly identifies (right file + right nature).
- **Precision** = does the run avoid falsely flagging N1–N3? The container (N1) is the classic
  false positive a reviewer without the layer map raises ("it imports concrete adapters!").
- A run that flags V7 must object to the *vendor leaking into the port shape*, not merely that
  `adapters.ts` imports `octokit` types.

---

## Iteration 2+ — discrimination cases (single-file + convention/exception knowledge)

Evals 0–3 run over the whole tree, where sibling files (ports + container) leak the intended
architecture, so an unguided model infers the rules and the skill's edge is small. The cases below
strip that context (review ONE file, no exploring) and target **conventions/exceptions the skill
uniquely supplies** — where a no-skill run is expected to get it **wrong**. Each is graded under
`single_file` + `no_explore` + `baseline_strip_project_context` (see evals.json `measurement`).

| Eval | Kind | Target | Ground truth | Expected no-skill failure | Iter-2 result |
| --- | --- | --- | --- | --- | --- |
| 4 · repo-intel | precision / single-file | `modules/repo-intel/service.ts` imports `adapters/astgrep` + `adapters/codeindex/extract` | **CORRECT / allowed.** repo-intel is the indexer subsystem reached via the `container.repoIntel` facade — the documented exception to `services-depend-on-ports` (`pathNot: src/modules/repo-intel/`). | Flags it as a `services-depend-on-ports` violation — a service importing an adapter looks illegal without the exception. | **CONFIRMED discriminator: with 2/2, baseline 0/2.** |
| 5 · shared-sync | knowledge / single-file+no-explore | "Add `latencyMs` to `Finding` in `server/src/vendor/shared/adapters.ts`" | Contract is **vendored as two hand-maintained copies** (`server/` + `client/src/vendor/shared/`), synced by hand — **both must be edited**. | With exploration barred and CLAUDE.md stripped, cannot know the `client/` copy exists. | Iter-2 run **CONTAMINATED** (explore allowed + CLAUDE.md inherited → baseline 2/2). Corrected to single-file + no-explore; re-run under clean harness. |
| 6 · depgraph | precision / single-file | `adapters/depgraph/index.ts` imports `modules/repo-intel/constants` (`SUPPORTED_EXT`) | **NOT a build-breaking error.** Documented sanctioned exception (`pathNot` on `adapters-dont-know-modules`); the depcruise gate does not fail on it. Clean fix: relocate the shared constant to `_shared`/`platform`, then delete the `pathNot`. | Calls it a flat "adapters must not import modules" violation, unaware it's carved out of the gate. | New (not yet run). |
| 7 · drift-severity | knowledge / single-file | `modules/reviews/routes.ts` runs an inline `db.select()` | `db-confined-to-repositories` is a **`warn`** (known drift, 8-file burn-down), NOT an `error`; depcruise exits non-zero only on `error`, so the gate is **green today** and does not block CI on this edge. Tracked drift to migrate into a repository, then promote to `error`. | Can call it "a violation" but cannot classify it as tolerated `warn` vs blocking `error`, nor state the gate stays green. | New (not yet run). |

**Retired:** `cross-module-import-singlefile` — did **not** discriminate (iter 2: with 2/2, baseline
2/2). A strong model flags reaching into `../reviews/helpers` as cross-module coupling unaided; the
skill only added the exact rule name + `_shared` fix. The fixtures (`modules/pulls/*`,
`modules/reviews/helpers.ts`) are kept and now feed eval-0's expanded whole-tree expectations.

**Measurement discipline (why the flags exist).** The iter-2 baselines were not truly DevDigest-blind:
subagents inherit the repo's `CLAUDE.md`/`AGENTS.md`, which encode "NO workspace hoisting", the
`@devdigest/shared` vendoring, and layer roles. Any knowledge eval must therefore run the baseline
**without** that project context, or the "no-skill" arm is contaminated. The CI runner in
`skill-evals/` owns enforcing `single_file` / `no_explore` / `baseline_strip_project_context`.

**Supporting fixtures added:** `adapters/astgrep/index.ts`, `adapters/codeindex/extract.ts`,
`adapters/depgraph/index.ts`, `modules/repo-intel/{service,constants}.ts`,
`modules/reviews/helpers.ts`, `modules/pulls/{service,routes}.ts`, and the second contract copy
`client/src/vendor/shared/adapters.ts`.

**Note for a future eval-0 re-run:** these files now live in `mini-backend/`, so a whole-tree sweep
would also see them — `repo-intel/service.ts` and `adapters/depgraph/index.ts` must **NOT** be
flagged (allowed exceptions), while `pulls/routes.ts` (→ `reviews/helpers`) and `pulls/service.ts`
(→ `reviews/repository`) ARE additional cross-module violations. Extend eval-0's ground truth before
re-running; iteration-1's eval-0 result stands as graded against the original 10-file tree.
