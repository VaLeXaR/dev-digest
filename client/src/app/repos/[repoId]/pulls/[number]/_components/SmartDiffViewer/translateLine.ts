/**
 * Blast Radius caller lines are indexed against the repo's DEFAULT BRANCH
 * (repo-intel only ever syncs+indexes `defaultBranch`, never a PR's own
 * head — see `server/src/modules/repo-intel/service.ts:sync`). When the
 * caller's own file is ALSO touched by the current PR, any hunk located
 * BEFORE the caller's indexed line shifts every line below it — the stored
 * line number then points at the wrong content once you're looking at the
 * PR's head version (what SmartDiffViewer renders). This translates a line
 * number from that indexed/base state to the equivalent line in the file's
 * head version, using the file's own unified-diff patch.
 */
export function translateBaseLineToHead(patch: string | null | undefined, baseLine: number): number {
  if (!patch) return baseLine;
  const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  let offset = 0;

  for (const raw of patch.split("\n")) {
    const m = raw.match(hunkRe);
    if (!m) continue;
    const oldStart = parseInt(m[1]!, 10);
    const oldLen = m[2] != null ? parseInt(m[2], 10) : 1;
    const newStart = parseInt(m[3]!, 10);
    const newLen = m[4] != null ? parseInt(m[4], 10) : 1;

    if (baseLine < oldStart) {
      // Target sits entirely before this (and every later) hunk — hunks
      // appear in file order, so the offset accumulated so far is final.
      break;
    }
    if (baseLine < oldStart + oldLen) {
      // Target falls INSIDE this hunk's old range — the exact old line may
      // have been rewritten/deleted, so there's no precise 1:1 equivalent.
      // Map proportionally within the new range as a best-effort landing
      // spot (reproduces the identical line for a simple 1-old-line ->
      // N-new-lines edit, which is the common case).
      const rel = baseLine - oldStart;
      return newStart + Math.min(rel, Math.max(newLen - 1, 0));
    }
    // Target is after this hunk (in old-file terms) — accumulate its net
    // line delta and keep checking subsequent hunks.
    offset += newLen - oldLen;
  }

  return baseLine + offset;
}
