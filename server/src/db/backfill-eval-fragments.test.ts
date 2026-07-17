import { describe, it, expect } from 'vitest';
import { sliceStoredCaseToFragment, type StoredEvalCaseFixture } from './backfill-eval-fragments.js';

/**
 * T-05: hermetic (no DB) coverage for the pure slice-a-stored-fixture step.
 * The main `backfillEvalFragments(db)` runner is a thin DB loop around this
 * helper and is exercised manually against the shared dev Postgres, not here.
 */

function wholePrDiff(paths: string[]): string {
  return paths
    .map((path) =>
      [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        '@@ -1,2 +1,3 @@',
        ' context line',
        `+added in ${path}`,
        ' context line',
      ].join('\n'),
    )
    .join('\n');
}

describe('sliceStoredCaseToFragment (T-05)', () => {
  it('slices a synthetic multi-file stored input_diff down to the expected_output file and narrows input_files', () => {
    const fixture: StoredEvalCaseFixture = {
      input_diff: wholePrDiff(['src/a.ts', 'src/b.ts', 'src/c.ts']),
      input_files: [
        { path: 'src/a.ts', additions: 1, deletions: 0, patch: 'patch-a' },
        { path: 'src/b.ts', additions: 1, deletions: 0, patch: 'patch-b' },
        { path: 'src/c.ts', additions: 1, deletions: 0, patch: 'patch-c' },
      ],
      expected_output: [{ type: 'must_find', file: 'src/b.ts', start_line: 2, end_line: 2 }],
    };

    const result = sliceStoredCaseToFragment(fixture);

    expect(result.changed).toBe(true);
    expect(result.skippedReason).toBeUndefined();
    expect(result.input_diff).toContain('src/b.ts');
    expect(result.input_diff).not.toContain('src/a.ts');
    expect(result.input_diff).not.toContain('src/c.ts');
    expect(result.input_files).toEqual([{ path: 'src/b.ts', additions: 1, deletions: 0, patch: 'patch-b' }]);
  });

  it('is idempotent — running it again on the already single-file fixture yields no change', () => {
    const fixture: StoredEvalCaseFixture = {
      input_diff: wholePrDiff(['src/a.ts', 'src/b.ts', 'src/c.ts']),
      input_files: [
        { path: 'src/a.ts', additions: 1, deletions: 0, patch: 'patch-a' },
        { path: 'src/b.ts', additions: 1, deletions: 0, patch: 'patch-b' },
        { path: 'src/c.ts', additions: 1, deletions: 0, patch: 'patch-c' },
      ],
      expected_output: [{ type: 'must_find', file: 'src/b.ts', start_line: 2, end_line: 2 }],
    };

    const first = sliceStoredCaseToFragment(fixture);
    expect(first.changed).toBe(true);

    const second = sliceStoredCaseToFragment({
      input_diff: first.input_diff,
      input_files: first.input_files,
      expected_output: fixture.expected_output,
    });

    expect(second.changed).toBe(false);
    expect(second.input_diff).toBe(first.input_diff);
    expect(second.input_files).toEqual(first.input_files);
  });

  it('leaves a fixture unchanged and flags it when the expected file is absent from its own stored diff', () => {
    const fixture: StoredEvalCaseFixture = {
      input_diff: wholePrDiff(['src/a.ts', 'src/c.ts']),
      input_files: [
        { path: 'src/a.ts', additions: 1, deletions: 0, patch: 'patch-a' },
        { path: 'src/c.ts', additions: 1, deletions: 0, patch: 'patch-c' },
      ],
      // 'src/missing.ts' was never in this case's own stored diff (e.g. fell
      // outside the pre-T-01 100-file cap) — nothing to slice.
      expected_output: [{ type: 'must_find', file: 'src/missing.ts', start_line: 2, end_line: 2 }],
    };

    const result = sliceStoredCaseToFragment(fixture);

    expect(result.changed).toBe(false);
    expect(result.skippedReason).toBeDefined();
    expect(result.input_diff).toBe(fixture.input_diff);
    expect(result.input_files).toEqual(fixture.input_files);
  });

  it('handles an empty expected_output (pure-precision case) as a no-op', () => {
    const fixture: StoredEvalCaseFixture = {
      input_diff: wholePrDiff(['src/a.ts']),
      input_files: [{ path: 'src/a.ts', additions: 1, deletions: 0, patch: 'patch-a' }],
      expected_output: [],
    };

    const result = sliceStoredCaseToFragment(fixture);

    expect(result.changed).toBe(false);
    expect(result.input_diff).toBe(fixture.input_diff);
  });
});
