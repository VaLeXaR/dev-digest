import { describe, expect, it } from 'vitest';
import { MockGitClient } from './mocks.js';
import type { RepoRef } from '@devdigest/shared';

const repo: RepoRef = { owner: 'acme', name: 'demo' };

describe('MockGitClient.listTrackedFiles', () => {
  it('returns the seeded tracked-file set when no pathspecs are given', async () => {
    const git = new MockGitClient({ trackedFiles: ['specs/foo.md', 'docs/bar.md'] });
    await expect(git.listTrackedFiles(repo)).resolves.toEqual(['specs/foo.md', 'docs/bar.md']);
  });

  it('returns an empty array when no tracked files were seeded', async () => {
    const git = new MockGitClient();
    await expect(git.listTrackedFiles(repo)).resolves.toEqual([]);
  });

  it('scopes results to the given pathspecs (path or directory prefix match)', async () => {
    const git = new MockGitClient({
      trackedFiles: ['specs/foo.md', 'docs/bar.md', 'README.md'],
    });
    await expect(git.listTrackedFiles(repo, ['specs'])).resolves.toEqual(['specs/foo.md']);
    await expect(git.listTrackedFiles(repo, ['specs', 'docs'])).resolves.toEqual([
      'specs/foo.md',
      'docs/bar.md',
    ]);
  });
});
