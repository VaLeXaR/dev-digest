import type { EvalCodeMode } from "@devdigest/shared";

/**
 * Single source of truth for the generated snippet's filename (R5/R12) — both
 * this generator and `skillExpectedOutput.ts`'s lenient `file` default import
 * this constant. No second `"snippet.ts"` literal may appear anywhere.
 */
export const SNIPPET_FILENAME = "snippet.ts";

/** Standard `diff -U3` context width, collapsing hunks within 2*this of each other. */
const CONTEXT_LINES = 3;

type DiffOp = { type: "ctx" | "del" | "ins"; line: string };

/**
 * Splits a Before/After textarea value into lines, stripping exactly one
 * trailing newline first — `server/src/adapters/git/diff-parser.ts:16`
 * (`raw.split('\n')`) turns an unstripped trailing "\n" into a phantom empty
 * context line. An entirely empty string is 0 lines (no content at all), not
 * "one blank line" — that distinction only matters for a blank line embedded
 * mid-file, which this does not collapse.
 */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const stripped = text.endsWith("\n") ? text.slice(0, -1) : text;
  return stripped.split("\n");
}

/**
 * Real LCS-based line diff — NOT a whole-file replace (see the plan's "Diff
 * algorithm" note: a whole-file replace would show the reviewer the entire
 * snippet as removed-and-re-added, degrading eval fidelity vs. a real PR diff).
 */
function diffOps(before: string[], after: string[]): DiffOp[] {
  const n = before.length;
  const m = after.length;
  // Rows/columns 0..n / 0..m are all filled below (either by `.fill(0)` at
  // creation or by the DP loop, which only ever reads row i+1/col j+1 — both
  // in-bounds since i/j never exceed n-1/m-1). Non-null assertions on `lcs`
  // reads are therefore safe, not a runtime risk suppressed for convenience.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i]!;
    const nextRow = lcs[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        before[i] === after[j]
          ? nextRow[j + 1]! + 1
          : Math.max(nextRow[j]!, row[j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const bi = before[i]!;
    const aj = after[j]!;
    if (bi === aj) {
      ops.push({ type: "ctx", line: bi });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: "del", line: bi });
      i++;
    } else {
      ops.push({ type: "ins", line: aj });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", line: before[i]! });
    i++;
  }
  while (j < m) {
    ops.push({ type: "ins", line: after[j]! });
    j++;
  }
  return ops;
}

type Hunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  ops: DiffOp[];
};

/**
 * Groups the raw op stream into hunks with `context` lines of surrounding
 * context, merging adjacent change blocks when the unchanged gap between them
 * is <= 2*context (standard `diff -U3` behaviour — "within 6 lines" for the
 * default context of 3).
 */
function buildHunks(ops: DiffOp[], context: number): Hunk[] {
  const changeRanges: Array<[number, number]> = [];
  let runStart = -1;
  ops.forEach((op, idx) => {
    if (op.type !== "ctx") {
      if (runStart === -1) runStart = idx;
    } else if (runStart !== -1) {
      changeRanges.push([runStart, idx - 1]);
      runStart = -1;
    }
  });
  if (runStart !== -1) changeRanges.push([runStart, ops.length - 1]);
  if (changeRanges.length === 0) return [];

  const firstRange = changeRanges[0]!;
  const mergedCores: Array<[number, number]> = [[firstRange[0], firstRange[1]]];
  for (let k = 1; k < changeRanges.length; k++) {
    const [s, e] = changeRanges[k]!;
    const last = mergedCores[mergedCores.length - 1]!;
    const gap = s - last[1] - 1;
    if (gap <= 2 * context) {
      last[1] = e;
    } else {
      mergedCores.push([s, e]);
    }
  }

  // Old/new line number "entering" each op — its 1-based line number before
  // the op itself is applied. Used both as each op's own line number (when it
  // has one) and as the fallback hunk start when a hunk has zero lines on
  // that side.
  const oldEntering: number[] = [];
  const newEntering: number[] = [];
  let oldCounter = 1;
  let newCounter = 1;
  for (const op of ops) {
    oldEntering.push(oldCounter);
    newEntering.push(newCounter);
    if (op.type === "ctx") {
      oldCounter++;
      newCounter++;
    } else if (op.type === "del") {
      oldCounter++;
    } else {
      newCounter++;
    }
  }

  return mergedCores.map(([coreStart, coreEnd]) => {
    const start = Math.max(0, coreStart - context);
    const end = Math.min(ops.length - 1, coreEnd + context);
    const hunkOps = ops.slice(start, end + 1);
    const oldLines = hunkOps.filter((o) => o.type !== "ins").length;
    const newLines = hunkOps.filter((o) => o.type !== "del").length;
    const oldStartRaw = oldEntering[start]!;
    const newStartRaw = newEntering[start]!;
    return {
      oldStart: oldLines === 0 ? Math.max(0, oldStartRaw - 1) : oldStartRaw,
      oldLines,
      newStart: newLines === 0 ? Math.max(0, newStartRaw - 1) : newStartRaw,
      newLines,
      ops: hunkOps,
    };
  });
}

function renderOp(op: DiffOp): string {
  if (op.type === "ctx") return ` ${op.line}`;
  if (op.type === "del") return `-${op.line}`;
  return `+${op.line}`;
}

/**
 * Generates a unified diff for the SKILL Code tab's Before/After fields,
 * against the fixed filename `SNIPPET_FILENAME`. Emits the exact byte format
 * `server/src/adapters/git/diff-parser.ts` requires (see file-level comments
 * on `splitLines`/`buildHunks`): a `+++ b/<file>` line is mandatory (a file
 * whose path stays empty is silently dropped by the parser), `--- ` lines are
 * skipped unconditionally by the parser so `--- /dev/null` is safe for new
 * files, and every context line — including blank ones — carries a single
 * leading space.
 *
 * Returns `""` when the result would carry no `+`/`-` lines at all (identical
 * Before/After, or both empty) — R10's Run/Save gate keys off this.
 */
export function generateDiff(input: { mode: EvalCodeMode; before: string; after: string }): string {
  const { mode, before, after } = input;

  if (mode === "new_file") {
    const afterLines = splitLines(after);
    if (afterLines.length === 0) return "";
    const body = afterLines.map((l) => `+${l}`).join("\n");
    return [
      `diff --git a/${SNIPPET_FILENAME} b/${SNIPPET_FILENAME}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${SNIPPET_FILENAME}`,
      `@@ -0,0 +1,${afterLines.length} @@`,
      body,
    ].join("\n");
  }

  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const ops = diffOps(beforeLines, afterLines);
  const hunks = buildHunks(ops, CONTEXT_LINES);
  if (hunks.length === 0) return "";

  const hunkBlocks = hunks.map((h) => {
    const header = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
    const body = h.ops.map(renderOp).join("\n");
    return `${header}\n${body}`;
  });

  return [
    `diff --git a/${SNIPPET_FILENAME} b/${SNIPPET_FILENAME}`,
    `--- a/${SNIPPET_FILENAME}`,
    `+++ b/${SNIPPET_FILENAME}`,
    ...hunkBlocks,
  ].join("\n");
}
