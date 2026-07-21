import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../platform/errors.js';

/**
 * Resolves the prebuilt agent-runner ncc bundle (AC-46) that gets embedded as
 * `.devdigest/runner/index.js` in every export. `agent-runner/` is a
 * standalone package (not a workspace member — see `agent-runner/CLAUDE.md`)
 * whose `dist/index.js` is gitignored and produced by
 * `cd agent-runner && pnpm install && pnpm build`. That build is a documented
 * deploy/setup prerequisite, not something this module runs on demand — if
 * it's missing, fail loudly with the exact command to fix it, never emit an
 * empty/placeholder file.
 */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// server/src/modules/ci -> repo root -> agent-runner/dist/index.js
const BUNDLE_PATH = join(MODULE_DIR, '..', '..', '..', '..', 'agent-runner', 'dist', 'index.js');

export function readRunnerBundle(): string {
  try {
    return readFileSync(BUNDLE_PATH, 'utf8');
  } catch (err) {
    throw new ConfigError(
      `agent-runner bundle not found at ${BUNDLE_PATH}. Build it first: ` +
        `cd agent-runner && pnpm install && pnpm build (never commit dist/, never hand-edit the runner source).`,
      { path: BUNDLE_PATH, cause: err instanceof Error ? err.message : String(err) },
    );
  }
}
