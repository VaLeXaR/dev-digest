import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { MockGitClient, type MockGitOptions } from '../../adapters/mocks.js';
import { ValidationError } from '../../platform/errors.js';
import { withCloneLock } from './lock.js';
import { scanRepoDocs } from './discovery.js';
import { createFolder, writeNewFile, extractArchive, editFile, ConflictError } from './writer.js';

const REPO = { owner: 'acme', name: 'widgets' };

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-writer-'));
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('createFolder', () => {
  it('mkdir -p under the root folder', async () => {
    const clonePath = trackedTempDir();
    await createFolder(clonePath, 'specs', 'new-area/sub');

    expect(fs.existsSync(path.join(clonePath, 'specs', 'new-area', 'sub'))).toBe(true);
  });

  it('rejects with ConflictError if the folder already exists', async () => {
    const clonePath = trackedTempDir();
    await createFolder(clonePath, 'specs', 'area');

    await expect(createFolder(clonePath, 'specs', 'area')).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a path that escapes the clone root, without writing anything', async () => {
    const clonePath = trackedTempDir();

    await expect(
      createFolder(clonePath, 'specs', '../../outside-dir'),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(fs.existsSync(path.join(path.dirname(clonePath), 'outside-dir'))).toBe(false);
  });
});

describe('writeNewFile', () => {
  it('writes a brand-new file, creating parent dirs', async () => {
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'nested/new.md', '# hello');

    expect(fs.readFileSync(path.join(clonePath, 'specs', 'nested', 'new.md'), 'utf8')).toBe(
      '# hello',
    );
  });

  it('rejects with ConflictError if the path already exists (tracked or untracked)', async () => {
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'existing.md', 'first');

    await expect(
      writeNewFile(clonePath, 'specs', 'existing.md', 'second'),
    ).rejects.toBeInstanceOf(ConflictError);
    // Never overwrites.
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'existing.md'), 'utf8')).toBe('first');
  });

  it('rejects a path outside the clone root, without writing anything', async () => {
    const clonePath = trackedTempDir();

    await expect(
      writeNewFile(clonePath, 'specs', '../../escape.md', 'nope'),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(fs.existsSync(path.join(path.dirname(clonePath), 'escape.md'))).toBe(false);
  });
});

describe('extractArchive', () => {
  it('recreates a nested archive structure on disk', async () => {
    const clonePath = trackedTempDir();
    const entries = [
      { path: 'a.md', content: 'A' },
      { path: 'nested/deep/b.md', content: 'B' },
    ];

    const result = await extractArchive(clonePath, 'specs', entries);

    expect(result.written.sort()).toEqual(['a.md', 'nested/deep/b.md']);
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'a.md'), 'utf8')).toBe('A');
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'nested', 'deep', 'b.md'), 'utf8')).toBe(
      'B',
    );
  });

  it('rejects the whole extraction with ConflictError if any entry path already exists, writing nothing', async () => {
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'a.md', 'already here');

    const entries = [
      { path: 'a.md', content: 'conflict' },
      { path: 'brand-new.md', content: 'should not land either' },
    ];

    await expect(extractArchive(clonePath, 'specs', entries)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'a.md'), 'utf8')).toBe('already here');
    expect(fs.existsSync(path.join(clonePath, 'specs', 'brand-new.md'))).toBe(false);
  });

  it('rejects the whole extraction with ValidationError if any entry escapes the clone root, writing nothing', async () => {
    // Defense-in-depth: `extractMarkdownEntries` (archive.ts) already filters
    // `..`/absolute entries before they ever reach the writer, but
    // `extractArchive`'s own `resolveGuarded` per-entry check must independently
    // reject a traversal-escaping entry path too — it must not trust its caller.
    const clonePath = trackedTempDir();
    const entries = [
      { path: 'ok.md', content: 'fine' },
      { path: '../../escape.md', content: 'should never be extracted' },
    ];

    await expect(extractArchive(clonePath, 'specs', entries)).rejects.toBeInstanceOf(
      ValidationError,
    );
    // No entry writes at all — not even the ones before the offending entry.
    expect(fs.existsSync(path.join(clonePath, 'specs', 'ok.md'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(clonePath), 'escape.md'))).toBe(false);
  });
});

describe('editFile', () => {
  it('overwrites an untracked file', async () => {
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'doc.md', 'old');
    const git = new MockGitClient({ trackedFiles: [] });

    await editFile(git, REPO, clonePath, 'specs/doc.md', 'new');

    expect(fs.readFileSync(path.join(clonePath, 'specs', 'doc.md'), 'utf8')).toBe('new');
  });

  it('refuses to edit a git-tracked path, re-checked live (not from a cache)', async () => {
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'doc.md', 'old');
    const git = new MockGitClient({ trackedFiles: ['specs/doc.md'] });

    await expect(
      editFile(git, REPO, clonePath, 'specs/doc.md', 'new'),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'doc.md'), 'utf8')).toBe('old');
  });

  it('rejects a path outside the clone root, without writing anything', async () => {
    const clonePath = trackedTempDir();
    const git = new MockGitClient({ trackedFiles: [] });

    await expect(
      editFile(git, REPO, clonePath, '../outside.md', 'nope'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fs.existsSync(path.join(path.dirname(clonePath), 'outside.md'))).toBe(false);
  });

  it('re-checks tracked status LIVE at write time, catching a doc that became tracked after a discovery scan cached it as untracked', async () => {
    // Simulates the actual race the spec calls out: a client fetches the
    // Context tab (discovery scan runs + caches `tracked: false` for this
    // doc), an external commit tracks the file, then the client's stale
    // "Edit" affordance still submits — editFile must refuse anyway because
    // it re-checks `git.listTrackedFiles` live, never the cached scan result.
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'doc.md', 'old');

    const gitOpts: MockGitOptions = { trackedFiles: [] };
    const git = new MockGitClient(gitOpts);

    const scanned = await scanRepoDocs(git, REPO, clonePath, ['specs']);
    expect(scanned.find((d) => d.path === 'specs/doc.md')).toMatchObject({ tracked: false });

    // External commit tracks the file AFTER the scan above cached `tracked:
    // false` — the discovery cache is never told about this.
    gitOpts.trackedFiles = ['specs/doc.md'];

    await expect(
      editFile(git, REPO, clonePath, 'specs/doc.md', 'new'),
    ).rejects.toBeInstanceOf(ConflictError);
    // The stale cache would have let this through — the live re-check must not.
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'doc.md'), 'utf8')).toBe('old');
  });

  it('normalizes a ".."-crafted path before the tracked-status check, refusing a tracked file addressed indirectly', async () => {
    // Isolates the writer.ts normalization step itself (not the service.ts
    // root-folder scope check, which would reject this path first in the real
    // request path) — proves editFile's own tracked-check can't be fooled by
    // an un-normalized path even if called directly.
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'doc.md', 'old');
    const git = new MockGitClient({ trackedFiles: ['specs/doc.md'] });

    await expect(
      editFile(git, REPO, clonePath, 'specs/sub/../doc.md', 'new'),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'doc.md'), 'utf8')).toBe('old');
  });
});

describe('withCloneLock (per-clone mutex, D5)', () => {
  it('serializes concurrent calls for the same clonePath', async () => {
    const clonePath = trackedTempDir();
    const order: string[] = [];

    const first = withCloneLock(clonePath, async () => {
      order.push('first-start');
      await delay(20);
      order.push('first-end');
    });
    const second = withCloneLock(clonePath, async () => {
      order.push('second-start');
      await delay(1);
      order.push('second-end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('still runs the next queued call after a previous one rejects', async () => {
    const clonePath = trackedTempDir();
    const order: string[] = [];

    const first = withCloneLock(clonePath, async () => {
      order.push('first');
      throw new Error('boom');
    });
    const second = withCloneLock(clonePath, async () => {
      order.push('second');
    });

    await expect(first).rejects.toThrow('boom');
    await second;

    expect(order).toEqual(['first', 'second']);
  });

  it('a rejecting create call does not stall a subsequent write to the same clone', async () => {
    const clonePath = trackedTempDir();
    await writeNewFile(clonePath, 'specs', 'first.md', 'one');

    // Conflicting write — rejects, but must not stall the lock.
    await expect(writeNewFile(clonePath, 'specs', 'first.md', 'dup')).rejects.toBeInstanceOf(
      ConflictError,
    );

    await writeNewFile(clonePath, 'specs', 'second.md', 'two');
    expect(fs.readFileSync(path.join(clonePath, 'specs', 'second.md'), 'utf8')).toBe('two');
  });
});
