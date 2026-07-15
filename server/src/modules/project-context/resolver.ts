import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { MAX_FILE_SIZE } from './constants.js';

export interface ResolveAttachedSpecsInput {
  /** Already agent-then-skills concatenated by the caller (T-09's job, not ours). */
  orderedPaths: string[];
  clonePath: string;
}

export interface ResolvedSpecsResult {
  /** Raw file content, one per surviving path, same order as `read`. */
  specs: string[];
  /** `{ path, content }` per surviving path, same order as `read`. */
  snapshot: { path: string; content: string }[];
  /** Paths that were actually read (survived dedup + all skip checks). */
  read: string[];
}

/**
 * Resolve an already-ordered (agent-then-skills) path list into readable spec
 * text.
 *
 * - Dedup **by path, first occurrence wins**, over the CONCATENATED input list
 *   — never a global Set/sort/slice applied after merging (that silently
 *   breaks agent-order-wins; server INSIGHTS 2026-07-02).
 * - Per surviving path: traversal-guard against `clonePath`, then read RAW
 *   BYTES (not `GitClient.readFile`'s decoded string) so size + UTF-8
 *   validity are checked byte-accurately.
 * - Skip + omit (never throw) when: the path is unresolved, its size exceeds
 *   `MAX_FILE_SIZE`, or its content is not valid UTF-8.
 *
 * Pure I/O — no DB access.
 */
export async function resolveAttachedSpecs(
  input: ResolveAttachedSpecsInput,
): Promise<ResolvedSpecsResult> {
  const { orderedPaths, clonePath } = input;

  const seen = new Set<string>();
  const dedupedPaths: string[] = [];
  for (const p of orderedPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    dedupedPaths.push(p);
  }

  const resolvedRoot = resolve(clonePath);
  const specs: string[] = [];
  const snapshot: { path: string; content: string }[] = [];
  const read: string[] = [];

  for (const path of dedupedPaths) {
    const full = resolve(clonePath, path);
    // Traversal guard — the `verifyEvidence` / `import.service.ts:39` invariant.
    if (full !== resolvedRoot && !full.startsWith(resolvedRoot + sep)) continue;

    let bytes: Buffer;
    try {
      bytes = await readFile(full);
    } catch {
      continue; // unresolvable — skip, never throw
    }

    if (bytes.length > MAX_FILE_SIZE) continue;

    const content = bytes.toString('utf8');
    // Decode-and-re-encode round-trip: Buffer#toString('utf8') replaces any
    // invalid sequence with U+FFFD, so a byte mismatch after re-encoding means
    // the source was not valid UTF-8.
    if (!Buffer.from(content, 'utf8').equals(bytes)) continue;

    specs.push(content);
    snapshot.push({ path, content });
    read.push(path);
  }

  return { specs, snapshot, read };
}
