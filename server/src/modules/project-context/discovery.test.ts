import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { MockGitClient } from '../../adapters/mocks.js';
import { getDiscovery, refreshDiscovery, scanRepoDocs } from './discovery.js';
import { MAX_FILE_SIZE } from './constants.js';

const REPO = { owner: 'acme', name: 'widgets' };

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-discovery-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const cleanupDirs: string[] = [];
function trackedTempDir(): string {
  const dir = makeTempDir();
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('scanRepoDocs', () => {
  it('finds .md files under root folders and reports tracked status + token estimate', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/SPEC-1.md', 'hello world'); // 11 bytes
    writeFile(clonePath, 'docs/guide.md', 'a'.repeat(40));
    writeFile(clonePath, 'README.md', 'ignored — not under a root folder');
    writeFile(clonePath, 'specs/notes.txt', 'ignored — wrong extension');

    const git = new MockGitClient({ trackedFiles: ['specs/SPEC-1.md'] });

    const docs = await scanRepoDocs(git, REPO, clonePath, ['specs', 'docs', 'insights']);
    const byPath = new Map(docs.map((d) => [d.path, d]));

    expect(byPath.size).toBe(2);
    expect(byPath.get('README.md')).toBeUndefined();

    const spec = byPath.get('specs/SPEC-1.md');
    expect(spec).toMatchObject({
      root_folder: 'specs',
      filename: 'SPEC-1.md',
      tracked: true,
      token_estimate: Math.ceil(11 / 4),
    });

    const guide = byPath.get('docs/guide.md');
    expect(guide).toMatchObject({
      root_folder: 'docs',
      filename: 'guide.md',
      tracked: false,
      token_estimate: Math.ceil(40 / 4),
    });
  });

  it('drops files larger than MAX_FILE_SIZE', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/small.md', 'small');
    writeFile(clonePath, 'specs/big.md', 'x'.repeat(MAX_FILE_SIZE + 1));

    const git = new MockGitClient();
    const docs = await scanRepoDocs(git, REPO, clonePath, ['specs']);

    expect(docs.map((d) => d.path)).toEqual(['specs/small.md']);
  });

  it('skips a root folder that does not exist on the clone, without throwing', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/only.md', 'content');

    const git = new MockGitClient();
    const docs = await scanRepoDocs(git, REPO, clonePath, ['specs', 'insights']);

    expect(docs.map((d) => d.path)).toEqual(['specs/only.md']);
  });
});

describe('getDiscovery / refreshDiscovery', () => {
  it('returns empty result with null scanned_at when the repo is not cloned', async () => {
    const git = new MockGitClient();
    const result = await getDiscovery(git, REPO, randomUUID(), null, ['specs']);

    expect(result).toEqual({ documents: [], scannedAt: null });
  });

  it('caches the scan result and does not re-scan on a second getDiscovery call', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/one.md', 'one');
    const git = new MockGitClient();
    const repoId = randomUUID();

    const first = await getDiscovery(git, REPO, repoId, clonePath, ['specs']);
    expect(first.documents.map((d) => d.path)).toEqual(['specs/one.md']);

    // Add a file after the first scan — a cached getDiscovery must NOT pick it up.
    writeFile(clonePath, 'specs/two.md', 'two');
    const second = await getDiscovery(git, REPO, repoId, clonePath, ['specs']);

    expect(second.documents.map((d) => d.path)).toEqual(['specs/one.md']);
    expect(second.scannedAt).toBe(first.scannedAt);
  });

  it('refreshDiscovery invalidates the cache and re-scans', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/one.md', 'one');
    const git = new MockGitClient();
    const repoId = randomUUID();

    await getDiscovery(git, REPO, repoId, clonePath, ['specs']);

    writeFile(clonePath, 'specs/two.md', 'two');
    const refreshed = await refreshDiscovery(git, REPO, repoId, clonePath, ['specs']);

    expect(refreshed.documents.map((d) => d.path).sort()).toEqual(['specs/one.md', 'specs/two.md']);

    const cachedAfterRefresh = await getDiscovery(git, REPO, repoId, clonePath, ['specs']);
    expect(cachedAfterRefresh.documents.map((d) => d.path).sort()).toEqual([
      'specs/one.md',
      'specs/two.md',
    ]);
  });
});
