import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { resolveAttachedSpecs } from './resolver.js';
import { MAX_FILE_SIZE } from './constants.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-resolver-'));
}

function writeFile(dir: string, relPath: string, content: string | Buffer): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
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

describe('resolveAttachedSpecs', () => {
  it('dedups by path, first occurrence wins, over the concatenated agent+skills list', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/a.md', 'A content');
    writeFile(clonePath, 'specs/shared.md', 'shared content');
    writeFile(clonePath, 'specs/b.md', 'B content');

    // Simulates the caller (T-09) concatenating agent-own paths before
    // skill-inherited paths, with one path attached to both.
    const agentPaths = ['specs/a.md', 'specs/shared.md'];
    const skillPaths = ['specs/shared.md', 'specs/b.md'];

    const result = await resolveAttachedSpecs({
      orderedPaths: [...agentPaths, ...skillPaths],
      clonePath,
    });

    expect(result.read).toEqual(['specs/a.md', 'specs/shared.md', 'specs/b.md']);
    expect(result.snapshot.map((s) => s.path)).toEqual(['specs/a.md', 'specs/shared.md', 'specs/b.md']);
    expect(result.specs).toEqual(['A content', 'shared content', 'B content']);
  });

  it('skips a path that does not resolve on disk, without throwing', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/exists.md', 'here');

    const result = await resolveAttachedSpecs({
      orderedPaths: ['specs/exists.md', 'specs/missing.md'],
      clonePath,
    });

    expect(result.read).toEqual(['specs/exists.md']);
  });

  it('skips a path escaping the clone root (traversal guard), without throwing', async () => {
    const clonePath = trackedTempDir();
    const outsideDir = trackedTempDir();
    writeFile(outsideDir, 'secret.md', 'should never be read');
    writeFile(clonePath, 'specs/ok.md', 'ok');

    const result = await resolveAttachedSpecs({
      orderedPaths: ['specs/ok.md', `../${path.basename(outsideDir)}/secret.md`],
      clonePath,
    });

    expect(result.read).toEqual(['specs/ok.md']);
  });

  it('skips a file larger than MAX_FILE_SIZE', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/small.md', 'small');
    writeFile(clonePath, 'specs/big.md', 'x'.repeat(MAX_FILE_SIZE + 1));

    const result = await resolveAttachedSpecs({
      orderedPaths: ['specs/small.md', 'specs/big.md'],
      clonePath,
    });

    expect(result.read).toEqual(['specs/small.md']);
  });

  it('skips a file whose content is not valid UTF-8', async () => {
    const clonePath = trackedTempDir();
    writeFile(clonePath, 'specs/valid.md', 'valid utf-8 content');
    // Lone continuation/invalid-start bytes — not decodable as valid UTF-8.
    writeFile(clonePath, 'specs/invalid.md', Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]));

    const result = await resolveAttachedSpecs({
      orderedPaths: ['specs/valid.md', 'specs/invalid.md'],
      clonePath,
    });

    expect(result.read).toEqual(['specs/valid.md']);
  });

  it('returns empty arrays for an empty input list', async () => {
    const clonePath = trackedTempDir();
    const result = await resolveAttachedSpecs({ orderedPaths: [], clonePath });
    expect(result).toEqual({ specs: [], snapshot: [], read: [] });
  });
});
