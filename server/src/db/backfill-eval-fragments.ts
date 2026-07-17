import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { ExpectedFinding } from '@devdigest/shared';
import { sliceDiff } from '@devdigest/reviewer-core';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';

/**
 * T-05 (docs/plans/eval-case-diff-fragment.md, grilling G-3): one-off,
 * IDEMPOTENT re-seed of the `eval_cases` rows persisted before T-02 restored
 * diff-FRAGMENT snapshotting — slices each case's ALREADY-STORED whole-PR
 * `input_diff` down to just the file(s) its `expected_output` references, so
 * old and new cases stay comparable (R7 — "inputs are fixed so runs of
 * different agent versions are comparable"). Byte-identical to a fresh
 * fragment seed, since the stored diff WAS `diffFromPrFiles(...).raw` at
 * creation time.
 *
 * Deliberately does NOT touch live `pr_files` (may itself be truncated or
 * gone) and does NOT call `buildSeedFromFinding` (re-fetches GitHub) — this
 * operates ONLY on each case's own stored fixture, so it's self-contained and
 * safe to re-run. A case whose expected file isn't present in its OWN stored
 * diff (e.g. it fell outside the pre-T-01 100-file cap) is skipped and
 * logged, never resurrected here — see server/INSIGHTS.md 2026-07-17.
 */

interface StoredFileEntry {
  path: string;
  additions?: number;
  deletions?: number;
  patch?: string | null;
}

function isStoredFileEntry(x: unknown): x is StoredFileEntry {
  return typeof x === 'object' && x !== null && typeof (x as { path?: unknown }).path === 'string';
}

export interface StoredEvalCaseFixture {
  input_diff: string;
  input_files: unknown;
  expected_output: ExpectedFinding[];
}

export interface SliceResult {
  changed: boolean;
  input_diff: string;
  input_files: unknown;
  /** Set (and `changed: false`) when the case's expected file(s) aren't
   *  present in its own stored `input_diff` — nothing to slice; the caller
   *  must leave the row untouched. */
  skippedReason?: string;
}

/**
 * Pure (no DB, no I/O) — re-slice one case's stored fixture down to the
 * file(s) its `expected_output` references. Idempotent: re-slicing an
 * already single-file fixture returns `changed: false` with the SAME
 * `input_diff` text.
 */
export function sliceStoredCaseToFragment(fixture: StoredEvalCaseFixture): SliceResult {
  const files = Array.from(new Set(fixture.expected_output.map((e) => e.file)));
  if (files.length === 0) {
    return { changed: false, input_diff: fixture.input_diff, input_files: fixture.input_files };
  }

  const original = parseUnifiedDiff(fixture.input_diff);
  const presentPaths = new Set(original.files.map((f) => f.path));
  const missing = files.filter((f) => !presentPaths.has(f));
  if (missing.length > 0) {
    return {
      changed: false,
      input_diff: fixture.input_diff,
      input_files: fixture.input_files,
      skippedReason: `expected file(s) not found in the case's own stored input_diff: ${missing.join(', ')}`,
    };
  }

  // sliceDiff silently returns the ENTIRE raw diff when a path isn't found
  // (reviewer-core/src/review/reduce.ts:70) — the presence check above and
  // the re-parse check below are both mandatory, mirroring T-02's guards.
  const fragmentRaw = files.map((f) => sliceDiff(original, f)).join('\n');
  const fragmentParsed = parseUnifiedDiff(fragmentRaw);
  const fragmentPaths = new Set(fragmentParsed.files.map((f) => f.path));
  const sliceOk =
    fragmentParsed.files.length === files.length && files.every((f) => fragmentPaths.has(f));
  if (!sliceOk) {
    return {
      changed: false,
      input_diff: fixture.input_diff,
      input_files: fixture.input_files,
      skippedReason: 'sliced fragment did not contain exactly the expected file(s)',
    };
  }

  const storedFiles = Array.isArray(fixture.input_files)
    ? fixture.input_files.filter(isStoredFileEntry)
    : [];
  const narrowedFiles = storedFiles.filter((f) => files.includes(f.path));
  const nextInputFiles = narrowedFiles.length > 0 ? narrowedFiles : fixture.input_files;

  const changed =
    fragmentRaw !== fixture.input_diff ||
    JSON.stringify(nextInputFiles) !== JSON.stringify(fixture.input_files);

  return { changed, input_diff: fragmentRaw, input_files: nextInputFiles };
}

function parseExpectedOutput(raw: unknown): ExpectedFinding[] {
  const parsed = ExpectedFinding.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Mirrors the (non-exported) `overlaps` helper in
 * `reviewer-core/src/eval/score.ts:34-40` / `eval/service.ts`'s T-03 guard.
 */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

interface ContradictionCheckRow {
  id: string;
  ownerKind: string;
  ownerId: string;
  expected: ExpectedFinding[];
}

/**
 * R7 (log-only, never auto-resolved — polarity redesign is out of scope):
 * flags existing case PAIRS for the same owner that make each other
 * impossible — same file, overlapping range, opposite type. Manual triage.
 */
function logContradictoryPairs(rows: ContradictionCheckRow[]): void {
  const byOwner = new Map<string, ContradictionCheckRow[]>();
  for (const row of rows) {
    const key = `${row.ownerKind}:${row.ownerId}`;
    const list = byOwner.get(key) ?? [];
    list.push(row);
    byOwner.set(key, list);
  }
  for (const [owner, ownerRows] of byOwner) {
    for (let i = 0; i < ownerRows.length; i++) {
      for (let j = i + 1; j < ownerRows.length; j++) {
        const a = ownerRows[i]!;
        const b = ownerRows[j]!;
        for (const ea of a.expected) {
          for (const eb of b.expected) {
            if (
              ea.file === eb.file &&
              ea.type !== eb.type &&
              rangesOverlap(ea.start_line, ea.end_line, eb.start_line, eb.end_line)
            ) {
              console.warn(
                `[backfill-eval-fragments] contradictory pair for owner ${owner}: case ${a.id} ` +
                  `(${ea.type}) vs case ${b.id} (${eb.type}) on ${ea.file}:${ea.start_line}-${ea.end_line} ` +
                  `— resolve manually.`,
              );
            }
          }
        }
      }
    }
  }
}

export interface BackfillSummary {
  updated: number;
  skipped: number;
  unchanged: number;
}

export async function backfillEvalFragments(db: Db): Promise<BackfillSummary> {
  const rows = await db.select().from(t.evalCases);

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  const forContradictionCheck: ContradictionCheckRow[] = [];

  for (const row of rows) {
    const expected = parseExpectedOutput(row.expectedOutput);
    forContradictionCheck.push({ id: row.id, ownerKind: row.ownerKind, ownerId: row.ownerId, expected });

    const result = sliceStoredCaseToFragment({
      input_diff: row.inputDiff ?? '',
      input_files: row.inputFiles,
      expected_output: expected,
    });

    if (result.skippedReason) {
      console.warn(`[backfill-eval-fragments] skipped case ${row.id}: ${result.skippedReason}`);
      skipped++;
      continue;
    }
    if (!result.changed) {
      unchanged++;
      continue;
    }

    await db
      .update(t.evalCases)
      .set({ inputDiff: result.input_diff, inputFiles: result.input_files })
      .where(eq(t.evalCases.id, row.id));
    updated++;
  }

  logContradictoryPairs(forContradictionCheck);

  return { updated, skipped, unchanged };
}

// CLI entrypoint — normalise to forward-slash URL so the check works on Windows
// (matches src/db/seed.ts / src/db/migrate.ts).
const _backfillUrl = import.meta.url.replace(/\\/g, '/');
const _backfillArgv = new URL(
  `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`,
).href;
if (_backfillUrl === _backfillArgv) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  backfillEvalFragments(handle.db)
    .then(async (r) => {
      console.log('✓ backfill complete', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ backfill failed:', err);
      await handle.close();
      process.exit(1);
    });
}
