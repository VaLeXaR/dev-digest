# Multi-File Skill Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change ZIP skill import so each directory containing `SKILL.md` becomes one skill, with body assembled from `SKILL.md` plus any files listed in its `includes:` frontmatter field.

**Architecture:** All changes are confined to `server/src/modules/skills/import.service.ts`. `parseFrontmatter` is extended to parse YAML list values. `previewFromZip` is rewritten to build a path→content map, locate `SKILL.md` entries, and call a new `assembleSkill` helper. Loose `.md` files and directories without `SKILL.md` are silently ignored.

**Tech Stack:** TypeScript, fflate (already in use for unzip), Vitest

## Global Constraints

- Only `server/src/modules/skills/import.service.ts` and its test file change — no DB, no contracts, no client changes.
- Run tests from `server/` directory: `pnpm exec vitest run src/modules/skills/import.service.test.ts`
- `fflate` is already a dependency — do not add new dependencies.
- `SKILL.md` is case-sensitive (capital letters only).
- One level of includes only — included files cannot themselves include other files.

---

### Task 1: Extend `parseFrontmatter` to parse YAML list values

**Files:**

- Modify: `server/src/modules/skills/import.service.ts` — `parseFrontmatter` function (lines 76-86)
- Modify: `server/src/modules/skills/import.service.test.ts` — add frontmatter list tests

**Context:** `parseFrontmatter` currently returns `Record<string, string>` and handles only simple `key: value` lines. It needs to also parse YAML sequence syntax:

```yaml
includes:
  - examples.md
  - config.md
```

The new return type is `Record<string, string | string[]>`.

**Interfaces:**

- Produces: `parseFrontmatter(fm: string): Record<string, string | string[]>` — callers in Task 2 rely on this signature.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/modules/skills/import.service.test.ts` inside the `describe` block:

```typescript
describe('parseFrontmatter (via previewFromBuffer)', () => {
  it('parses includes list from SKILL.md frontmatter', async () => {
    const md = `---\nname: My Skill\ntype: convention\nincludes:\n  - examples.md\n  - config.md\n---\nBody`;
    // We'll test this indirectly via ZIP in Task 2.
    // Here we verify the existing single-file path still works with the new signature.
    const previews = await svc.previewFromBuffer(Buffer.from(md), 'skill.md');
    expect(previews[0]?.name).toBe('My Skill');
    expect(previews[0]?.type).toBe('convention');
    expect(previews[0]?.body).toBe('Body');
  });

  it('ignores includes field in single-file mode (no zip)', async () => {
    const md = `---\nname: Solo\nincludes:\n  - other.md\n---\nOnly body`;
    const previews = await svc.previewFromBuffer(Buffer.from(md), 'solo.md');
    expect(previews[0]?.body).toBe('Only body');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (they should already, as single-file path is unchanged)**

```bash
cd server && pnpm exec vitest run src/modules/skills/import.service.test.ts
```

Expected: All tests PASS (includes field is currently just ignored in single-file mode).

- [ ] **Step 3: Update `parseFrontmatter` to parse YAML list values**

Replace the entire `parseFrontmatter` function in `server/src/modules/skills/import.service.ts`:

```typescript
function parseFrontmatter(fm: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const lines = fm.split('\n');
  let listKey: string | null = null;
  let listValues: string[] = [];

  const flushList = () => {
    if (listKey !== null) {
      result[listKey] = listValues;
      listKey = null;
      listValues = [];
    }
  };

  for (const line of lines) {
    // YAML sequence item: "  - value" or "- value"
    const listMatch = line.match(/^\s+-\s+(.*)/);
    if (listMatch) {
      if (listKey !== null) listValues.push(listMatch[1]!.trim());
      continue;
    }

    flushList();

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');

    if (value === '') {
      // No inline value — next lines may be list items
      listKey = key;
    } else {
      result[key] = value;
    }
  }

  flushList();
  return result;
}
```

Also update the `parseMdText` method to use `typeof` guards instead of unsafe casts, since `parseFrontmatter` now returns `string | string[]` values. Replace the return statement inside the `if (fmMatch)` block of `parseMdText`:

```typescript
const rawType = fm['type'];
return {
  name: (typeof fm['name'] === 'string' ? fm['name'] : undefined) ?? filenameToName(filename),
  description: typeof fm['description'] === 'string' ? fm['description'] : '',
  type: (typeof rawType === 'string' && VALID_TYPES.includes(rawType as SkillType)
    ? rawType
    : 'custom') as SkillType,
  body,
  source,
  filename,
};
```

- [ ] **Step 4: Run tests to verify they still pass**

```bash
cd server && pnpm exec vitest run src/modules/skills/import.service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/skills/import.service.ts server/src/modules/skills/import.service.test.ts
git commit -m "feat(skills): extend parseFrontmatter to parse YAML list values"
```

---

### Task 2: Rewrite `previewFromZip` for directory-based skill detection

**Files:**

- Modify: `server/src/modules/skills/import.service.ts` — `previewFromZip`, add `assembleSkill`, add `dirnameToName`
- Modify: `server/src/modules/skills/import.service.test.ts` — add ZIP tests

**Context:** The current `previewFromZip` iterates all `.md` files and yields one preview per file. The new version must:

1. Build a `Map<path, string>` (decoded text content) from the zip
2. Find all paths ending in `/SKILL.md` (must have a parent directory)
3. For each, call `assembleSkill` which reads frontmatter `includes:`, resolves paths relative to the skill's directory, and concatenates content
4. Return one `SkillPreview` per `SKILL.md` found

`fflate.zipSync` is available to create test ZIPs.

**Interfaces:**

- Consumes: `parseFrontmatter(fm): Record<string, string | string[]>` from Task 1
- Produces: `previewFromZip(buffer: Buffer): SkillPreview[]` (same external signature, different behaviour)

- [ ] **Step 1: Write the failing tests**

Add a helper and new `describe` block to `server/src/modules/skills/import.service.test.ts`. Add the import at the top of the file alongside the existing `fflate` imports:

```typescript
import { zipSync, strToU8 } from 'fflate';
```

Add the helper function and describe block after the existing `describe` block:

```typescript
function makeZip(files: Record<string, string>): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = strToU8(content);
  }
  return Buffer.from(zipSync(entries));
}

describe('previewFromZip — directory-based skills', () => {
  it('returns one preview per SKILL.md directory', async () => {
    const zip = makeZip({
      'ts-conventions/SKILL.md': '---\nname: TS Conventions\ntype: convention\n---\nBody here',
      'security/SKILL.md': '---\nname: Security Rules\ntype: security\n---\nSec body',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews).toHaveLength(2);
    const names = previews.map(p => p.name).sort();
    expect(names).toEqual(['Security Rules', 'TS Conventions']);
  });

  it('assembles body from includes listed in frontmatter', async () => {
    const zip = makeZip({
      'my-skill/SKILL.md': '---\nname: My Skill\nincludes:\n  - examples.md\n  - config.md\n---\nMain body',
      'my-skill/examples.md': 'Example content',
      'my-skill/config.md': 'Config content',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews).toHaveLength(1);
    expect(previews[0]?.body).toBe('Main body\n\nExample content\n\nConfig content');
  });

  it('ignores loose .md files at archive root', async () => {
    const zip = makeZip({
      'skill-dir/SKILL.md': '---\nname: Valid\n---\nBody',
      'README.md': '# Ignored',
      'loose.md': 'Also ignored',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews).toHaveLength(1);
    expect(previews[0]?.name).toBe('Valid');
  });

  it('ignores directories without SKILL.md', async () => {
    const zip = makeZip({
      'valid/SKILL.md': '---\nname: Valid\n---\nBody',
      'no-entry/rules.md': 'No SKILL.md here',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews).toHaveLength(1);
  });

  it('skips missing include files silently', async () => {
    const zip = makeZip({
      'skill/SKILL.md': '---\nname: Partial\nincludes:\n  - missing.md\n---\nMain',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews).toHaveLength(1);
    expect(previews[0]?.body).toBe('Main');
  });

  it('ignores path traversal in includes', async () => {
    const zip = makeZip({
      'skill/SKILL.md': '---\nname: Safe\nincludes:\n  - ../outside.md\n---\nBody',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews[0]?.body).toBe('Body');
  });

  it('throws when archive has no SKILL.md in any directory', async () => {
    const zip = makeZip({ 'orphan.md': '# No skills here' });
    await expect(svc.previewFromBuffer(zip, 'skills.zip')).rejects.toThrow('No skills found');
  });

  it('falls back to directory name when SKILL.md has no frontmatter', async () => {
    const zip = makeZip({
      'typescript-best-practices/SKILL.md': 'No frontmatter here, just body text.',
    });
    const previews = await svc.previewFromBuffer(zip, 'skills.zip');
    expect(previews[0]?.name).toBe('typescript best practices');
    expect(previews[0]?.type).toBe('custom');
  });
});
```

- [ ] **Step 2: Run tests to verify new ZIP tests fail**

```bash
cd server && pnpm exec vitest run src/modules/skills/import.service.test.ts
```

Expected: The new ZIP tests FAIL (current `previewFromZip` treats all `.md` as skills).

- [ ] **Step 3: Rewrite `previewFromZip` and add helpers**

Replace the `previewFromZip` method and add two new private methods in `server/src/modules/skills/import.service.ts`:

```typescript
private previewFromZip(buffer: Buffer): SkillPreview[] {
  const raw = unzipSync(new Uint8Array(buffer));

  // Build path → decoded text map (reject path traversal)
  const fileMap = new Map<string, string>();
  for (const [path, data] of Object.entries(raw)) {
    if (path.includes('..') || path.startsWith('/')) continue;
    fileMap.set(path, strFromU8(data));
  }

  // Find all SKILL.md entries that are inside a directory (path has at least one '/')
  const skillMdPaths = [...fileMap.keys()].filter(p => {
    const parts = p.split('/');
    return parts.length >= 2 && parts.at(-1) === 'SKILL.md';
  });

  if (skillMdPaths.length === 0) {
    throw new Error('No skills found in archive. Each skill must be a directory containing SKILL.md.');
  }

  return skillMdPaths.map(skillMdPath => {
    const lastSlash = skillMdPath.lastIndexOf('/');
    const dirPath = skillMdPath.slice(0, lastSlash + 1); // e.g. "ts-conventions/"
    const dirName = dirPath.split('/').filter(Boolean).at(-1) ?? dirPath;
    return this.assembleSkill(fileMap.get(skillMdPath)!, dirPath, dirName, fileMap);
  });
}

private assembleSkill(
  skillMdContent: string,
  dirPath: string,
  dirName: string,
  fileMap: Map<string, string>,
): SkillPreview {
  const fmMatch = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  let name: string;
  let description: string;
  let type: SkillType;
  let body: string;
  let includes: string[] = [];

  if (fmMatch) {
    const fm = parseFrontmatter(fmMatch[1]!);
    body = fmMatch[2]!.trim();
    name = (typeof fm['name'] === 'string' ? fm['name'] : undefined) ?? dirnameToName(dirName);
    description = typeof fm['description'] === 'string' ? fm['description'] : '';
    const rawType = fm['type'];
    type = (typeof rawType === 'string' && VALID_TYPES.includes(rawType as SkillType)
      ? rawType
      : 'custom') as SkillType;
    const rawIncludes = fm['includes'];
    includes = Array.isArray(rawIncludes) ? rawIncludes : [];
  } else {
    name = dirnameToName(dirName);
    description = '';
    type = 'custom';
    body = skillMdContent.trim();
  }

  for (const inc of includes) {
    if (inc.includes('..') || inc.startsWith('/')) continue;
    const incPath = dirPath + inc;
    const incContent = fileMap.get(incPath);
    if (!incContent) continue;
    body += '\n\n' + incContent.trim();
  }

  return { name, description, type, body, source: 'imported_file', filename: dirPath };
}
```

Also add this module-level function alongside the existing `filenameToName`:

```typescript
function dirnameToName(dirname: string): string {
  return dirname.replace(/[-_]/g, ' ');
}
```

- [ ] **Step 4: Run tests to verify they all pass**

```bash
cd server && pnpm exec vitest run src/modules/skills/import.service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run typecheck**

```bash
cd server && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/skills/import.service.ts server/src/modules/skills/import.service.test.ts
git commit -m "feat(skills): directory-based ZIP import — SKILL.md per directory assembles one skill"
```
