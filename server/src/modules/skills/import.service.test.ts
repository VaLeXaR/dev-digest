import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { SkillsImportService } from './import.service.js';

const svc = new SkillsImportService();

describe('SkillsImportService', () => {
  it('parses a markdown file with frontmatter', async () => {
    const md = `---\nname: my-skill\ndescription: checks stuff\ntype: security\n---\n# Body here`;
    const previews = await svc.previewFromBuffer(Buffer.from(md), 'my-skill.md');
    expect(previews).toHaveLength(1);
    expect(previews[0]?.name).toBe('my-skill');
    expect(previews[0]?.type).toBe('security');
    expect(previews[0]?.body).toBe('# Body here');
  });

  it('derives name from filename when no frontmatter', async () => {
    const md = `# Hello`;
    const previews = await svc.previewFromBuffer(Buffer.from(md), 'no-then-chains.md');
    expect(previews[0]?.name).toBe('no then chains');
    expect(previews[0]?.type).toBe('custom');
  });

  it('rejects private IP URLs', async () => {
    await expect(svc.previewFromUrl('http://192.168.1.1/skill.md')).rejects.toThrow('not allowed');
  });

  it('rejects non-http URLs', async () => {
    await expect(svc.previewFromUrl('file:///etc/passwd')).rejects.toThrow('http');
  });

  describe('parseFrontmatter (via previewFromBuffer)', () => {
    it('parses includes list from SKILL.md frontmatter', async () => {
      const md = `---\nname: My Skill\ntype: convention\nincludes:\n  - examples.md\n  - config.md\n---\nBody`;
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
});

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
