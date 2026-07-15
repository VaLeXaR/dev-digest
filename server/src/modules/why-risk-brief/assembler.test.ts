import { describe, it, expect } from 'vitest';
import { INJECTION_GUARD } from '@devdigest/reviewer-core';
import type { DiscoveredDoc, SmartDiffGroup } from '@devdigest/shared';
import {
  buildWhyRiskBriefInput,
  selectOverlappingSpecs,
  normalizeDiffStats,
  estimateBriefTokens,
  estimateFullDiffTokens,
  type WhyRiskBriefInputArgs,
} from './assembler.js';

// ---------- helpers -----------------------------------------------------------

function makeDoc(overrides: Partial<DiscoveredDoc> & { path: string; token_estimate: number }): DiscoveredDoc {
  return {
    root_folder: 'specs',
    filename: overrides.path.split('/').at(-1) ?? overrides.path,
    tracked: true,
    used_by_agents: 0,
    ...overrides,
  };
}

const FULL_ARGS: WhyRiskBriefInputArgs = {
  prTitle: 'Add rate limiting',
  prBody: 'This PR adds rate limiting to the API.',
  intent: {
    intent: 'Adds rate limiting middleware',
    in_scope: ['rate limiting'],
    out_of_scope: ['auth'],
  },
  blastSummary: '2 changed symbols, 3 external callers.',
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'handleRequest', file: 'src/server.ts', line: 42 }],
      endpoints_affected: ['POST /api/pulls'],
      crons_affected: [],
    },
  ],
  diffStats: [{ path: 'src/middleware/rateLimit.ts', additions: 20, deletions: 3, role: 'core' }],
  issue: { title: 'Rate limiting needed', body: 'We need rate limiting on the API.' },
  specs: [{ path: 'specs/rate-limiting/design.md', content: 'Use a token bucket algorithm.' }],
};

// ---------- buildWhyRiskBriefInput --------------------------------------------

describe('buildWhyRiskBriefInput', () => {
  it('never includes raw diff/patch body text (AC-4)', () => {
    const patchBody = '@@ -1,3 +1,4 @@\n+const x = evil();\n-removed line';
    const result = buildWhyRiskBriefInput(FULL_ARGS);

    expect(result).not.toContain('@@');
    expect(result).not.toContain(patchBody);
    expect(result).not.toContain('+const x = evil();');
  });

  it('includes derived facts: intent, blast summary, downstream names, diff stats', () => {
    const result = buildWhyRiskBriefInput(FULL_ARGS);

    expect(result).toContain('Adds rate limiting middleware');
    expect(result).toContain('2 changed symbols, 3 external callers.');
    expect(result).toContain('rateLimit');
    expect(result).toContain('handleRequest');
    expect(result).toContain('POST /api/pulls');
    expect(result).toContain('src/middleware/rateLimit.ts');
    expect(result).toContain('+20');
    expect(result).toContain('-3');
  });

  it('omits blast/intent/issue/specs sections cleanly when absent', () => {
    const minimal: WhyRiskBriefInputArgs = {
      prTitle: 'Fix typo',
      prBody: null,
      intent: null,
      blastSummary: null,
      downstream: [],
      diffStats: [],
      issue: null,
      specs: [],
    };
    const result = buildWhyRiskBriefInput(minimal);

    expect(result).toContain('Fix typo');
    expect(result).not.toContain('Intent:');
    expect(result).not.toContain('Blast Radius:');
    expect(result).not.toContain('Linked Issue:');
    expect(result).not.toContain('Context-Folder Specs:');
  });

  it('prepends INJECTION_GUARD and wraps linked-issue + spec text in <untrusted> (AC-13)', () => {
    const result = buildWhyRiskBriefInput(FULL_ARGS);

    expect(result).toContain(INJECTION_GUARD);
    expect(result.indexOf(INJECTION_GUARD)).toBe(0);

    // Linked issue is wrapped.
    expect(result).toMatch(/<untrusted source="issue">[\s\S]*Rate limiting needed[\s\S]*<\/untrusted>/);

    // Spec content is wrapped.
    expect(result).toMatch(
      /<untrusted source="spec:specs\/rate-limiting\/design\.md">[\s\S]*Use a token bucket algorithm\.[\s\S]*<\/untrusted>/,
    );

    // PR title/body is also wrapped.
    expect(result).toMatch(/<untrusted source="pr">[\s\S]*Add rate limiting[\s\S]*<\/untrusted>/);
  });

  it('caps the linked-issue body at 8000 chars', () => {
    const longBody = 'x'.repeat(9000);
    const args: WhyRiskBriefInputArgs = {
      ...FULL_ARGS,
      issue: { title: 'Long issue', body: longBody },
    };
    const result = buildWhyRiskBriefInput(args);
    const occurrences = result.split('x'.repeat(8000));
    expect(occurrences.length).toBeGreaterThan(1);
    expect(result).not.toContain('x'.repeat(8001));
  });
});

// ---------- selectOverlappingSpecs --------------------------------------------

describe('selectOverlappingSpecs', () => {
  it('returns [] when no discovered doc overlaps a changed file directory', () => {
    const docs = [makeDoc({ path: 'docs/unrelated/readme.md', token_estimate: 100 })];
    const changedFiles = ['src/middleware/rateLimit.ts'];

    expect(selectOverlappingSpecs(docs, changedFiles, 10_000)).toEqual([]);
  });

  it('includes a doc only when it shares a real directory prefix, not a raw string prefix', () => {
    const docs = [
      makeDoc({ path: 'src/foo-evil/notes.md', token_estimate: 100 }),
      makeDoc({ path: 'src/foo/notes.md', token_estimate: 100 }),
    ];
    const changedFiles = ['src/foo/handler.ts'];

    const selected = selectOverlappingSpecs(docs, changedFiles, 10_000);

    expect(selected.map((d) => d.path)).toEqual(['src/foo/notes.md']);
  });

  it('accumulates token_estimate and stops once tokenBudget would be exceeded', () => {
    const docs = [
      makeDoc({ path: 'src/foo/a.md', token_estimate: 400 }),
      makeDoc({ path: 'src/foo/b.md', token_estimate: 400 }),
      makeDoc({ path: 'src/foo/c.md', token_estimate: 400 }),
    ];
    const changedFiles = ['src/foo/handler.ts'];

    const selected = selectOverlappingSpecs(docs, changedFiles, 900);

    expect(selected.map((d) => d.path)).toEqual(['src/foo/a.md', 'src/foo/b.md']);
  });
});

// ---------- normalizeDiffStats ------------------------------------------------

describe('normalizeDiffStats', () => {
  it('falls back to raw per-file additions/deletions when no SmartDiff groups', () => {
    const result = normalizeDiffStats({
      rawFiles: [
        { path: 'src/a.ts', additions: 5, deletions: 1 },
        { path: 'src/b.ts', additions: 0, deletions: 10 },
      ],
    });

    expect(result).toEqual([
      { path: 'src/a.ts', additions: 5, deletions: 1 },
      { path: 'src/b.ts', additions: 0, deletions: 10 },
    ]);
  });

  it('falls back to raw files when smartDiffGroups is an empty array', () => {
    const result = normalizeDiffStats({
      smartDiffGroups: [],
      rawFiles: [{ path: 'src/a.ts', additions: 2, deletions: 2 }],
    });

    expect(result).toEqual([{ path: 'src/a.ts', additions: 2, deletions: 2 }]);
  });

  it('prefers SmartDiffGroup[] and carries the per-group role', () => {
    const groups: SmartDiffGroup[] = [
      {
        role: 'core',
        files: [
          {
            path: 'src/core.ts',
            pseudocode_summary: null,
            additions: 12,
            deletions: 4,
            patch: '@@ -1,1 +1,2 @@\n+added',
            findings: [],
          },
        ],
      },
      {
        role: 'boilerplate',
        files: [
          {
            path: 'src/gen.ts',
            pseudocode_summary: null,
            additions: 1,
            deletions: 0,
            patch: null,
            findings: [],
          },
        ],
      },
    ];

    const result = normalizeDiffStats({ smartDiffGroups: groups, rawFiles: [] });

    expect(result).toEqual([
      { path: 'src/core.ts', additions: 12, deletions: 4, role: 'core' },
      { path: 'src/gen.ts', additions: 1, deletions: 0, role: 'boilerplate' },
    ]);
  });
});

// ---------- token instrument ---------------------------------------------------

describe('estimateBriefTokens / estimateFullDiffTokens', () => {
  it('estimates roughly 1 token per 4 characters', () => {
    expect(estimateBriefTokens('a'.repeat(400))).toBe(100);
  });

  it('estimateFullDiffTokens sums patch bodies, ignoring null patches', () => {
    const files = [{ patch: 'a'.repeat(400) }, { patch: null }, { patch: 'b'.repeat(400) }];
    // joined with '\n' between entries: 400 + 1(\n) + 0 + 1(\n) + 400 = 802 chars
    expect(estimateFullDiffTokens(files)).toBe(Math.ceil(802 / 4));
  });
});
