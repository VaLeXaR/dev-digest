import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DepCruiseGraph } from './index.js';

describe('DepCruiseGraph.buildEdges', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns POSIX-separated edges that match the POSIX-normalized input file list', async () => {
    // Fixture must live on the same drive as `process.cwd()` — dependency-cruiser
    // mis-resolves cross-drive absolute paths on Windows (os.tmpdir() is
    // typically on C:, this project may be on another drive).
    dir = await mkdtemp(join(process.cwd(), 'tmp-depgraph-test-'));
    await writeFile(join(dir, 'a.ts'), "import { helper } from './b';\nexport const a = helper();\n");
    await writeFile(join(dir, 'b.ts'), 'export function helper() { return 1; }\n');

    // Mirrors pipeline/walk.ts: POSIX-normalized paths, as stored in `symbols`/passed as `walk.files`.
    const files = ['a.ts', 'b.ts'];
    const graph = new DepCruiseGraph();
    const edges = await graph.buildEdges(dir, files);

    expect(edges).toContainEqual({ from: 'a.ts', to: 'b.ts' });
    // Regression guard: on Windows, `path.relative` returns backslash-separated
    // paths — if `toRel` doesn't normalize them, no edge ever matches a
    // POSIX-normalized `fileSet`, silently zeroing the whole import graph.
    const fileSet = new Set(files);
    for (const e of edges) {
      expect(e.from).not.toContain('\\');
      expect(e.to).not.toContain('\\');
      expect(fileSet.has(e.from)).toBe(true);
      expect(fileSet.has(e.to)).toBe(true);
    }
  });
});
