/**
 * Export-to-CI (L07/T-02) — shared literal constants for the manifest/workflow
 * generators, the export route, and the pull-based ingest. Kept in one place
 * so the branch name / paths used when COMMITTING files match exactly what
 * the WORKFLOW references and what the RUNNER (`agent-runner`) expects to
 * find on disk (`agent-runner/src/manifest.ts:findManifestPath`,
 * `agent-runner/src/skills.ts:loadSkillBodies`).
 */

/** Branch the export commits to; PRs are opened/refreshed against this head. */
export const CI_BRANCH = 'devdigest/ci';

/** Root directory for every generated file the studio writes into a target repo. */
export const DEVDIGEST_DIR = '.devdigest';

/** Where the agent manifest is written — `agent-runner` expects exactly one *.yaml here. */
export const AGENTS_DIR = `${DEVDIGEST_DIR}/agents`;

/** Where per-skill markdown bodies are written, one per linked skill slug. */
export const SKILLS_DIR = `${DEVDIGEST_DIR}/skills`;

/** Placeholder cross-run memory log (AC per T-02 Action) — no consumer reads this yet
 * (agent-runner does not load memory today); scaffolded for a future lesson. */
export const MEMORY_PATH = `${DEVDIGEST_DIR}/memory.jsonl`;

/** Destination path for the embedded, prebuilt agent-runner ncc bundle (AC-46). */
export const RUNNER_BUNDLE_PATH = `${DEVDIGEST_DIR}/runner/index.js`;

/** Generated GitHub Actions workflow file path. */
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';

/** Name the runner's `actions/upload-artifact` step gives its bundle — the
 * ingest side looks for a `WorkflowArtifact.name` matching this. */
export const RESULT_ARTIFACT_NAME = 'devdigest-result';

/** File name the runner writes locally before upload (`agent-runner/src/index.ts`). */
export const RESULT_FILE_NAME = 'devdigest-result.json';

/** The only trigger types the generated workflow may ever request (AC-34: `pull_request`
 * only, never `pull_request_target`; AC-35: never `issue_comment`). */
export const ALLOWED_TRIGGERS = ['opened', 'synchronize', 'reopened'] as const;
export type AllowedTrigger = (typeof ALLOWED_TRIGGERS)[number];
