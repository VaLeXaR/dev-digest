import type { CiExportInput } from '@devdigest/shared';
import {
  ALLOWED_TRIGGERS,
  RESULT_ARTIFACT_NAME,
  RESULT_FILE_NAME,
  RUNNER_BUNDLE_PATH,
  type AllowedTrigger,
} from './constants.js';

/**
 * Only `pull_request` event TYPES are ever accepted (AC-34: never
 * `pull_request_target`; AC-35: never `issue_comment`) — filtering here means
 * an unexpected value in `CiExportInput.triggers` (already a plain
 * `z.array(z.string())` at the contract level) can never leak an
 * unsupported/insecure trigger into the generated workflow.
 */
function sanitizeTriggers(triggers: readonly string[]): AllowedTrigger[] {
  const allowed = new Set<string>(ALLOWED_TRIGGERS);
  const kept = triggers.filter((t): t is AllowedTrigger => allowed.has(t));
  // Never emit an empty `types:` — GitHub treats a present-but-empty list as
  // "no filter" (every pull_request activity type), the opposite of scoping.
  return kept.length > 0 ? kept : ['opened', 'synchronize'];
}

/**
 * Build the generated GitHub Actions workflow YAML (AC-16, AC-31…AC-35, AC-46).
 *
 * Hand-templated — NOT `yaml.stringify()` — so `${{ ... }}` GitHub Actions
 * expression syntax is emitted byte-for-byte; a generic YAML stringifier
 * would quote/escape those braces unpredictably across runs. This is the
 * ONLY place the workflow text is produced; `service.ts` never string-edits
 * the result afterward.
 *
 * Security invariants below are NOT parameterized by `input` — a caller can
 * only choose *which* `pull_request` sub-types trigger the job and how
 * results are posted, never the permission scope, the secret channel, or the
 * execution mechanism:
 *  - `permissions:` is EXACTLY `contents: read` + `pull-requests: write` (AC-31)
 *  - triggers ONLY `pull_request` (never `pull_request_target`, AC-34)
 *  - NO `issue_comment`/comment-triggered runs anywhere in the file (AC-35)
 *  - the LLM key is referenced ONLY as `${{ secrets.OPENROUTER_API_KEY }}` (AC-32)
 *  - no secret literal anywhere in the file (AC-33)
 *  - runs the bundled runner directly — no marketplace `uses: devdigest/...` (AC-16/AC-46)
 *  - the job is skipped when the PR head is a fork (defense in depth: a
 *    forked PR's contributor never gets this job's secrets even though the
 *    trigger restriction already excludes `pull_request_target`)
 */
export function buildWorkflowYaml(input: CiExportInput): string {
  const types = sanitizeTriggers(input.triggers);
  return `name: DevDigest Review

on:
  pull_request:
    types: [${types.join(', ')}]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Run DevDigest review
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_POST_AS: ${input.post_as}
          DEVDIGEST_RESULT_PATH: \${{ github.workspace }}/${RESULT_FILE_NAME}
        run: node ${RUNNER_BUNDLE_PATH}

      - name: Upload result artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ${RESULT_ARTIFACT_NAME}
          path: ${RESULT_FILE_NAME}
          if-no-files-found: ignore
`;
}
