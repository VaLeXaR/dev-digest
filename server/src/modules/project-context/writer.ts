import { mkdir, stat, writeFile as writeFileFs } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { GitClient, RepoRef } from '@devdigest/shared';
import { AppError, ValidationError } from '../../platform/errors.js';
import { withCloneLock } from './lock.js';
import type { ExtractedMarkdownEntry } from './archive.js';

/** A create/write/extract targeted an already-existing path (AC-36). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}

/**
 * Resolves `boundaryRoot` + `segments` and guards against traversal escaping
 * `boundaryRoot` — the `verifyEvidence` / `resolver.ts` invariant, load-
 * bearing on writes too (spec `## Non-functional`). `boundaryRoot` is
 * whichever directory the caller wants `segments` confined to: the clone root
 * for `editFile` (no fixed sub-directory), or the specific `rootFolder`
 * directory for the create/upload paths — NOT the clone root in that case, or
 * a `path` like `../other-root/x.md` would stay inside the clone while
 * escaping the `rootFolder` it was supposed to be scoped to.
 */
function resolveGuarded(boundaryRoot: string, ...segments: string[]): string {
  const resolvedRoot = resolve(boundaryRoot);
  const full = resolve(boundaryRoot, ...segments);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + sep)) {
    throw new ValidationError(`Path escapes the allowed root: ${segments.join('/')}`);
  }
  return full;
}

async function pathExists(full: string): Promise<boolean> {
  try {
    await stat(full);
    return true;
  } catch {
    return false;
  }
}

/**
 * `mkdir -p` a folder under `rootFolder` (AC-31). Rejects with
 * `ConflictError` if the path already exists (AC-36) instead of silently
 * succeeding, unlike a bare `mkdir({ recursive: true })`. `rootFolder` is
 * assumed already validated by the caller to be in the resolved root-folder
 * set.
 */
export async function createFolder(
  clonePath: string,
  rootFolder: string,
  path: string,
): Promise<void> {
  return withCloneLock(clonePath, async () => {
    const full = resolveGuarded(resolve(clonePath, rootFolder), path);
    if (await pathExists(full)) {
      throw new ConflictError(`Path already exists: ${rootFolder}/${path}`);
    }
    await mkdir(full, { recursive: true });
  });
}

/**
 * Write a brand-new file under `rootFolder` (inline create or single-file
 * upload, AC-32). Rejects with `ConflictError` if the path already exists —
 * tracked or untracked — never overwrites (AC-36).
 */
export async function writeNewFile(
  clonePath: string,
  rootFolder: string,
  path: string,
  content: string,
): Promise<void> {
  return withCloneLock(clonePath, async () => {
    const full = resolveGuarded(resolve(clonePath, rootFolder), path);
    if (await pathExists(full)) {
      throw new ConflictError(`Path already exists: ${rootFolder}/${path}`);
    }
    await mkdir(dirname(full), { recursive: true });
    await writeFileFs(full, content, 'utf8');
  });
}

/**
 * Write every extracted archive entry under `rootFolder`, preserving nested
 * structure (AC-33). Every entry's path is conflict-checked BEFORE any entry
 * is written, so a conflict anywhere in the archive rejects the whole
 * extraction rather than leaving a partial write (AC-36).
 */
export async function extractArchive(
  clonePath: string,
  rootFolder: string,
  entries: ExtractedMarkdownEntry[],
): Promise<{ written: string[] }> {
  return withCloneLock(clonePath, async () => {
    const rootFolderPath = resolve(clonePath, rootFolder);
    const resolved = entries.map((entry) => ({
      entry,
      full: resolveGuarded(rootFolderPath, entry.path),
    }));

    for (const { entry, full } of resolved) {
      if (await pathExists(full)) {
        throw new ConflictError(`Path already exists: ${rootFolder}/${entry.path}`);
      }
    }

    const written: string[] = [];
    for (const { entry, full } of resolved) {
      await mkdir(dirname(full), { recursive: true });
      await writeFileFs(full, entry.content, 'utf8');
      written.push(entry.path);
    }
    return { written };
  });
}

/**
 * Overwrite an existing document's content (AC-37). Re-checks
 * `git.listTrackedFiles` LIVE — never trusts a (possibly stale) discovery
 * cache result — and refuses to edit a path that is currently git-tracked,
 * even if it became tracked mid-session after an external commit (AC-38).
 *
 * Normalizes `path` to its canonical clone-relative POSIX form (via
 * `resolveGuarded` + `relative`) BEFORE the tracked-status check — `git
 * ls-files` normalizes its own pathspec/output, so comparing against the raw,
 * un-normalized `path` (e.g. `specs/../README.md`) would let a `..`-crafted
 * path masquerade as a different, untracked path and slip past this gate.
 */
export async function editFile(
  git: GitClient,
  repo: RepoRef,
  clonePath: string,
  path: string,
  content: string,
): Promise<void> {
  return withCloneLock(clonePath, async () => {
    const full = resolveGuarded(clonePath, path);
    const normalized = relative(resolve(clonePath), full).split(sep).join('/');
    const tracked = await git.listTrackedFiles(repo, [normalized]);
    if (tracked.includes(normalized)) {
      throw new ConflictError(`Cannot edit a git-tracked file: ${normalized}`);
    }
    await writeFileFs(full, content, 'utf8');
  });
}
