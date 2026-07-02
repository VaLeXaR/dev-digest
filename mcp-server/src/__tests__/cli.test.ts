import { describe, it, expect, vi } from 'vitest';
import { runCli, parseCliArgs, formatReview, UsageError } from '../cli.js';
import type { ApiClient, DiffReview } from '../lib/api-client.js';
import { ApiError } from '../lib/api-client.js';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgents: vi.fn(),
    startReview: vi.fn(),
    listRuns: vi.fn(),
    getReviews: vi.fn(),
    getConventions: vi.fn(),
    reviewDiff: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,2 @@
-const a = 1;
+const a = 2;
 const b = 2;
`;

const SAMPLE_REVIEW: DiffReview = {
  verdict: 'Needs work',
  summary: 'One issue found in the working tree.',
  score: 72,
  findings: [
    {
      severity: 'high',
      category: 'correctness',
      title: 'Off-by-one risk',
      file: 'src/foo.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'The reassignment changes behaviour.',
      suggestion: 'Double-check callers of `a`.',
    },
  ],
};

describe('parseCliArgs', () => {
  it('(d) throws UsageError with a "not implemented" message for --mode staged', () => {
    expect(() => parseCliArgs(['review', '--mode', 'staged'])).toThrow(UsageError);
    try {
      parseCliArgs(['review', '--mode', 'staged']);
      expect.fail('expected parseCliArgs to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toContain('not implemented');
    }
  });
});

describe('runCli', () => {
  it('(a) happy path — prints formatted review and exits 0', async () => {
    const getDiff = vi.fn().mockResolvedValue(SAMPLE_DIFF);
    const reviewDiff = vi.fn().mockResolvedValue(SAMPLE_REVIEW);
    const client = makeClient({ reviewDiff });
    const out = vi.fn();
    const err = vi.fn();
    const exit = vi.fn();

    await runCli(['review', '--mode', 'working'], {
      getDiff,
      client,
      cwd: '/repo',
      out,
      err,
      exit,
    });

    expect(reviewDiff).toHaveBeenCalledWith(SAMPLE_DIFF);
    expect(out).toHaveBeenCalledTimes(1);
    const printed = out.mock.calls[0]?.[0] as string;
    expect(printed).toContain('high');
    expect(printed).toContain('src/foo.ts:1');
    expect(printed).toContain('Off-by-one risk');
    expect(printed).toContain('Needs work');
    expect(printed).toContain('72/100');
    expect(printed).toContain('1 finding(s)');
    expect(err).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('(b) clean tree — prints the no-changes message, exits 0, never calls reviewDiff', async () => {
    const getDiff = vi.fn().mockResolvedValue('   \n');
    const reviewDiff = vi.fn();
    const client = makeClient({ reviewDiff });
    const out = vi.fn();
    const err = vi.fn();
    const exit = vi.fn();

    await runCli(['review', '--mode', 'working'], {
      getDiff,
      client,
      cwd: '/repo',
      out,
      err,
      exit,
    });

    expect(out).toHaveBeenCalledWith('No uncommitted changes to review.');
    expect(reviewDiff).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('(c) not a git repo — prints the error and exits non-zero', async () => {
    const notAGitRepoError = new Error(
      'Not a git repository. Run devdigest review from inside a git repo.',
    );
    const getDiff = vi.fn().mockRejectedValue(notAGitRepoError);
    const client = makeClient();
    const out = vi.fn();
    const err = vi.fn();
    const exit = vi.fn();

    await runCli(['review', '--mode', 'working'], {
      getDiff,
      client,
      cwd: '/repo',
      out,
      err,
      exit,
    });

    expect(err).toHaveBeenCalledWith(
      'Not a git repository. Run devdigest review from inside a git repo.',
    );
    expect(exit).toHaveBeenCalledTimes(1);
    const code = exit.mock.calls[0]?.[0] as number;
    expect(code).not.toBe(0);
  });

  it('(d) invalid mode — reports "not implemented" via err and exits non-zero', async () => {
    const getDiff = vi.fn();
    const client = makeClient();
    const out = vi.fn();
    const err = vi.fn();
    const exit = vi.fn();

    await runCli(['review', '--mode', 'staged'], {
      getDiff,
      client,
      cwd: '/repo',
      out,
      err,
      exit,
    });

    expect(getDiff).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    const message = err.mock.calls[0]?.[0] as string;
    expect(message).toContain('not implemented');
    expect(exit).toHaveBeenCalledTimes(1);
    const code = exit.mock.calls[0]?.[0] as number;
    expect(code).not.toBe(0);
  });

  it('(e) server down — reports "Cannot reach the DevDigest API" and exits non-zero', async () => {
    const getDiff = vi.fn().mockResolvedValue(SAMPLE_DIFF);
    const networkError = new TypeError('fetch failed');
    const reviewDiff = vi.fn().mockRejectedValue(networkError);
    const client = makeClient({ reviewDiff });
    const out = vi.fn();
    const err = vi.fn();
    const exit = vi.fn();

    await runCli(['review', '--mode', 'working'], {
      getDiff,
      client,
      cwd: '/repo',
      out,
      err,
      exit,
    });

    expect(err).toHaveBeenCalledTimes(1);
    const message = err.mock.calls[0]?.[0] as string;
    expect(message).toContain('Cannot reach the DevDigest API');
    expect(exit).toHaveBeenCalledTimes(1);
    const code = exit.mock.calls[0]?.[0] as number;
    expect(code).not.toBe(0);
  });

  it('propagates a server ApiError as "Review failed: <message>" and exits non-zero', async () => {
    const getDiff = vi.fn().mockResolvedValue(SAMPLE_DIFF);
    const reviewDiff = vi.fn().mockRejectedValue(new ApiError('HTTP 500: Internal Server Error', 500));
    const client = makeClient({ reviewDiff });
    const out = vi.fn();
    const err = vi.fn();
    const exit = vi.fn();

    await runCli(['review', '--mode', 'working'], {
      getDiff,
      client,
      cwd: '/repo',
      out,
      err,
      exit,
    });

    expect(err).toHaveBeenCalledWith('Review failed: HTTP 500: Internal Server Error');
    expect(exit).toHaveBeenCalledTimes(1);
    const code = exit.mock.calls[0]?.[0] as number;
    expect(code).not.toBe(0);
  });
});

describe('formatReview', () => {
  it('renders header, summary, and per-finding details including a line range and suggestion', () => {
    const review: DiffReview = {
      verdict: 'Approve',
      summary: 'Looks good overall.',
      score: 95,
      findings: [
        {
          severity: 'low',
          category: 'style',
          title: 'Minor naming nit',
          file: 'src/bar.ts',
          start_line: 4,
          end_line: 6,
          rationale: 'The variable name is unclear.',
          suggestion: null,
        },
      ],
    };

    const text = formatReview(review);

    expect(text).toContain('Approve');
    expect(text).toContain('95/100');
    expect(text).toContain('1 finding(s)');
    expect(text).toContain('Looks good overall.');
    expect(text).toContain('[low] src/bar.ts:4-6');
    expect(text).toContain('Minor naming nit');
    expect(text).toContain('The variable name is unclear.');
    expect(text).not.toContain('Suggestion:');
  });
});
