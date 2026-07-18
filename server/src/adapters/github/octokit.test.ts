import { describe, it, expect, vi } from 'vitest';
import type { Octokit } from 'octokit';
import type { RepoRef } from '@devdigest/shared';
import { OctokitGitHubClient, MAX_PR_COMMITS } from './octokit.js';

/**
 * T-01: hermetic (no network) coverage for GitHub PR file/commit/review-comment
 * pagination. Every case injects a stubbed `octokit` via the new constructor
 * seam — the manual page loop is what makes this fully mockable without
 * `octokit.paginate` (see server/INSIGHTS.md 2026-07-17).
 */

const repo: RepoRef = { owner: 'acme', name: 'widgets' };

function makeFile(i: number) {
  return { filename: `src/file-${i}.ts`, additions: 1, deletions: 0, patch: `patch-${i}` };
}
function makeCommit(i: number) {
  return {
    sha: `sha-${i}`,
    commit: { message: `commit ${i}`, author: { name: 'octocat', date: '2026-07-17T00:00:00Z' } },
    author: { login: 'octocat' },
  };
}

/** Slices a full in-memory list into the requested page (mirrors GitHub's own per_page/page semantics). */
function pageOf<T>(all: T[], page: number, perPage = 100): { data: T[] } {
  const start = (page - 1) * perPage;
  return { data: all.slice(start, start + perPage) };
}

function buildStubOctokit(opts: { files?: unknown[]; commits?: unknown[] }) {
  const files = opts.files ?? [makeFile(1)];
  const commits = opts.commits ?? [makeCommit(1)];
  return {
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            number: 1,
            title: 'Test PR',
            user: { login: 'octocat' },
            head: { ref: 'feat/x', sha: 'sha1' },
            base: { ref: 'main' },
            additions: 1,
            deletions: 0,
            changed_files: files.length,
            state: 'open',
            merged_at: null,
            created_at: '2026-07-17T00:00:00Z',
            updated_at: '2026-07-17T00:00:00Z',
            body: '',
          },
        }),
        listFiles: vi.fn((args: { page?: number }) => Promise.resolve(pageOf(files, args.page ?? 1))),
        listCommits: vi.fn((args: { page?: number }) => Promise.resolve(pageOf(commits, args.page ?? 1))),
        listReviewComments: vi.fn(() => Promise.resolve({ data: [] })),
      },
      issues: { get: vi.fn() },
    },
  } as unknown as Octokit;
}

describe('OctokitGitHubClient — paginated PR lists (T-01)', () => {
  it('getPullRequest returns all files across >=3 stubbed pages (250 files), not just 100', async () => {
    const files = Array.from({ length: 250 }, (_, i) => makeFile(i));
    const octokit = buildStubOctokit({ files });
    const logger = { warn: vi.fn() };
    const client = new OctokitGitHubClient('token', { octokit, logger });

    const detail = await client.getPullRequest(repo, 1);

    expect(detail.files).toHaveLength(250);
    expect(octokit.rest.pulls.listFiles).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(logger.warn).not.toHaveBeenCalled(); // 250 < MAX_PR_FILES (3000), no truncation
  });

  it('when the stub keeps returning full pages past the cap, exactly one truncation warn is emitted and the returned length equals the cap', async () => {
    // MAX_PR_COMMITS = 250: 3 full pages of 100 = 300 commits, past the cap.
    const commits = Array.from({ length: 300 }, (_, i) => makeCommit(i));
    const octokit = buildStubOctokit({ commits });
    const logger = { warn: vi.fn() };
    const client = new OctokitGitHubClient('token', { octokit, logger });

    const detail = await client.getPullRequest(repo, 1);

    expect(detail.commits).toHaveLength(MAX_PR_COMMITS);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      // `fetched` is the raw count actually retrieved before truncation (300),
      // not the capped return length — it's the diagnostically useful number
      // for judging how much was cut off.
      expect.objectContaining({ pr: 1, cap: MAX_PR_COMMITS, fetched: 300 }),
      expect.stringContaining('truncated at cap'),
    );
  });

  it('a normal <100-file PR emits no warning and makes exactly one page call', async () => {
    const files = Array.from({ length: 42 }, (_, i) => makeFile(i));
    const octokit = buildStubOctokit({ files });
    const logger = { warn: vi.fn() };
    const client = new OctokitGitHubClient('token', { octokit, logger });

    const detail = await client.getPullRequest(repo, 1);

    expect(detail.files).toHaveLength(42);
    expect(octokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
