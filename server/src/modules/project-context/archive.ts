import { posix } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { MD_EXT } from './constants.js';

export interface ExtractedMarkdownEntry {
  /** Repo-relative POSIX path inside the archive (never escapes the archive root). */
  path: string;
  content: string;
}

/**
 * Virtual extraction root used ONLY to resolve zip-slip candidates
 * (`posix.resolve`) — this function never touches the filesystem. The real
 * target root on disk is decided by the caller (`writer.ts`'s
 * `extractArchive`, under `clonePath`/`rootFolder`).
 */
const VIRTUAL_ROOT = '/__project-context-archive__';

/**
 * Extract every `.md` entry from a ZIP buffer as `{ path, content }` pairs,
 * preserving internal structure (AC-33). Non-`.md` entries are silently
 * ignored (AC-34). Any entry attempting to escape the extraction root — a
 * literal `..` segment, an absolute path, or a resolved path outside the
 * virtual root — is rejected WITHOUT being extracted (AC-35, zip-slip).
 *
 * Pure function — no fs access.
 */
export function extractMarkdownEntries(zipBuffer: Buffer): ExtractedMarkdownEntry[] {
  const raw = unzipSync(new Uint8Array(zipBuffer));
  const entries: ExtractedMarkdownEntry[] = [];

  for (const [rawPath, data] of Object.entries(raw)) {
    if (posix.extname(rawPath).toLowerCase() !== MD_EXT) continue; // ignore non-.md (AC-34)

    if (rawPath.includes('..') || rawPath.startsWith('/')) continue; // zip-slip guard (AC-35)

    const resolved = posix.resolve(VIRTUAL_ROOT, rawPath);
    if (resolved !== VIRTUAL_ROOT && !resolved.startsWith(`${VIRTUAL_ROOT}/`)) continue;

    entries.push({ path: rawPath, content: strFromU8(data) });
  }

  return entries;
}
