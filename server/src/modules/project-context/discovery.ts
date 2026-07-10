import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import type { DiscoveredDoc, GitClient, RepoRef } from '@devdigest/shared';
import { EXCLUDED_DIRS, MAX_FILE_SIZE, MD_EXT } from './constants.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);

interface CacheEntry {
  result: DiscoveredDoc[];
  scannedAt: string;
}

/**
 * In-memory per-process discovery cache (D3 — no DB backing, an accepted
 * trade-off; see plan `## Decisions` D3). Populated on first scan, replaced
 * on refresh.
 */
const cache = new Map<string, CacheEntry>();

export interface DiscoveryResult {
  documents: DiscoveredDoc[];
  /** null when never scanned (repo not cloned). */
  scannedAt: string | null;
}

interface Candidate {
  /** POSIX repo-relative path. */
  rel: string;
  full: string;
  rootFolder: string;
}

/**
 * Walk `clonePath` for `.md` files under any of `rootFolders`, then mark each
 * as `tracked` via exactly one `git.listTrackedFiles` call. Pure I/O — no cache.
 */
export async function scanRepoDocs(
  git: GitClient,
  repo: RepoRef,
  clonePath: string,
  rootFolders: string[],
): Promise<DiscoveredDoc[]> {
  const candidates: Candidate[] = [];
  for (const rootFolder of rootFolders) {
    await walkRootFolder(clonePath, join(clonePath, rootFolder), rootFolder, candidates);
  }

  const tracked = new Set(await git.listTrackedFiles(repo, rootFolders));

  const documents: DiscoveredDoc[] = [];
  for (const { rel, full, rootFolder } of candidates) {
    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue; // vanished between walk and stat — skip cleanly
    }
    if (size > MAX_FILE_SIZE) continue;

    documents.push({
      path: rel,
      root_folder: rootFolder,
      filename: basename(rel),
      tracked: tracked.has(rel),
      token_estimate: Math.ceil(size / 4),
    });
  }

  return documents;
}

/**
 * Recursive readdir modeled on `repo-intel/pipeline/walk.ts`: never follow
 * symlinks, skip `EXCLUDED_DIRS`, POSIX-normalize the repo-relative path.
 * Rooted at a single resolved root folder, so every collected path's first
 * segment is that root folder by construction.
 */
async function walkRootFolder(
  clonePathRoot: string,
  dir: string,
  rootFolder: string,
  out: Candidate[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Root folder absent on this clone, or an unreadable subdir — skip cleanly.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops, perf)
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkRootFolder(clonePathRoot, join(dir, name), rootFolder, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (extname(name).toLowerCase() !== MD_EXT) continue;

    const full = join(dir, name);
    const rel = relative(clonePathRoot, full).split(sep).join('/');
    out.push({ rel, full, rootFolder });
  }
}

async function scanAndCache(
  git: GitClient,
  repo: RepoRef,
  repoId: string,
  clonePath: string,
  rootFolders: string[],
): Promise<DiscoveryResult> {
  const result = await scanRepoDocs(git, repo, clonePath, rootFolders);
  const scannedAt = new Date().toISOString();
  cache.set(repoId, { result, scannedAt });
  return { documents: result, scannedAt };
}

/**
 * Cached discovery result, or a fresh scan+cache when this repo has never
 * been scanned in this process. Repo not cloned (`clonePath` null) → empty
 * result, never a crash (mirrors the `REPO_INTEL_ENABLED` degrade pattern).
 */
export async function getDiscovery(
  git: GitClient,
  repo: RepoRef,
  repoId: string,
  clonePath: string | null,
  rootFolders: string[],
): Promise<DiscoveryResult> {
  if (!clonePath) return { documents: [], scannedAt: null };

  const cached = cache.get(repoId);
  if (cached) return { documents: cached.result, scannedAt: cached.scannedAt };

  return scanAndCache(git, repo, repoId, clonePath, rootFolders);
}

/** Invalidates the cached entry, then re-scans (AC-3). */
export async function refreshDiscovery(
  git: GitClient,
  repo: RepoRef,
  repoId: string,
  clonePath: string | null,
  rootFolders: string[],
): Promise<DiscoveryResult> {
  cache.delete(repoId);
  if (!clonePath) return { documents: [], scannedAt: null };
  return scanAndCache(git, repo, repoId, clonePath, rootFolders);
}
