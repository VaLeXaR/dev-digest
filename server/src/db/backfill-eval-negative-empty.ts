import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { ExpectedFinding } from '@devdigest/shared';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';

/**
 * T-03 (docs/plans/eval-negative-empty-output.md, grilling G-B): one-off,
 * IDEMPOTENT migration of legacy dismissed-seeded negative eval cases from a
 * `must_not_flag` entry to an empty `expected_output` array (`[]`), so the
 * whole eval set carries one uniform negative shape before the R8 empirical
 * re-run (docs/plans/eval-negative-empty-output.md). Mirrors
 * `backfill-eval-fragments.ts`'s structure (pure helper + CLI entrypoint).
 *
 * Keys on SHAPE alone — every `expected_output` entry is `must_not_flag`, and
 * there's at least one — no finding lookup needed. A positive (`must_find`)
 * case never has a `must_not_flag`-only array (server INSIGHTS 2026-07-17),
 * so this can never mis-convert a positive. A case with a MIX of `must_find`
 * and `must_not_flag` entries (never produced by the seeder, but possible via
 * a manual edit) is left untouched — only a pure must_not_flag-only array is
 * converted. An already-empty `[]` row is `unchanged` (idempotent re-run).
 */

function parseExpectedOutput(raw: unknown): ExpectedFinding[] {
  const parsed = ExpectedFinding.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Pure — true when the case is a legacy must_not_flag-only negative. */
export function isLegacyMustNotFlagOnly(expected: ExpectedFinding[]): boolean {
  return expected.length > 0 && expected.every((e) => e.type === 'must_not_flag');
}

export interface BackfillSummary {
  converted: number;
  unchanged: number;
}

export async function backfillEvalNegativeEmpty(db: Db): Promise<BackfillSummary> {
  const rows = await db.select().from(t.evalCases);

  let converted = 0;
  let unchanged = 0;

  for (const row of rows) {
    const expected = parseExpectedOutput(row.expectedOutput);
    if (!isLegacyMustNotFlagOnly(expected)) {
      unchanged++;
      continue;
    }

    await db.update(t.evalCases).set({ expectedOutput: [] }).where(eq(t.evalCases.id, row.id));
    console.log(
      `[backfill-eval-negative-empty] converted case ${row.id} ` +
        `(${expected.length} must_not_flag ${expected.length === 1 ? 'entry' : 'entries'}) -> []`,
    );
    converted++;
  }

  return { converted, unchanged };
}

// CLI entrypoint — normalise to forward-slash URL so the check works on Windows
// (matches src/db/seed.ts / src/db/migrate.ts / backfill-eval-fragments.ts).
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
  backfillEvalNegativeEmpty(handle.db)
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
