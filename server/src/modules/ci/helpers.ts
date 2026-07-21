import { unzipSync, strFromU8 } from 'fflate';
import type { RepoRef } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { RESULT_FILE_NAME } from './constants.js';

/**
 * Pure helpers for the export/ingest routes — no I/O, kept separate so the
 * security-sensitive input validation (AC-19) is independently testable.
 */

// "owner/name" only — no leading/trailing slash, no empty segment, no path
// traversal (`.` / `..` alone are rejected by requiring at least one
// alphanumeric on each side); never interpolated into a path/shell unescaped.
const OWNER_NAME_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Validate + parse a `"owner/name"` repo string as DATA (A05/A08) — throws
 * BEFORE any GitHub call is made (AC-19). Callers must invoke this first in
 * every route/service path that accepts a caller-supplied repo string.
 */
export function parseOwnerName(repo: string): RepoRef {
  if (!OWNER_NAME_RE.test(repo)) {
    throw new ValidationError(`repo must be "owner/name" (got: ${JSON.stringify(repo)})`);
  }
  const [owner, name] = repo.split('/');
  return { owner: owner!, name: name! };
}

/**
 * Extract + JSON.parse the `devdigest-result.json` entry from a downloaded
 * workflow-run artifact ZIP (`GitHubActionsClient.downloadArtifact` returns
 * the raw archive — see the port's doc comment in `vendor/shared/adapters.ts`).
 * Returns `null` on ANY failure (corrupt zip, missing entry, invalid JSON) so
 * the caller's `safeParse` gate (AC-29) is the single point that decides
 * reject-vs-persist — this never throws.
 */
export function extractResultArtifactJson(zip: Buffer): unknown | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zip));
  } catch {
    return null;
  }
  const entryName = Object.keys(files).find(
    (name) => name === RESULT_FILE_NAME || name.endsWith(`/${RESULT_FILE_NAME}`),
  );
  if (!entryName) return null;
  try {
    return JSON.parse(strFromU8(files[entryName]!));
  } catch {
    return null;
  }
}
