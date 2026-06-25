import { describe, it, expect, vi, afterEach } from 'vitest';
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

  describe('previewFromUrl — GitHub repo root URLs (ZIP archive)', () => {
    const SKILL_MD = '---\nname: Test Skill\ntype: custom\n---\nBody text';

    function mockFetch(responses: Array<{ status: number; buffer?: Buffer }>) {
      let call = 0;
      return vi.spyOn(global, 'fetch').mockImplementation(async () => {
        const r = responses[call++] ?? { status: 404 };
        const buf = r.buffer ?? Buffer.alloc(0);
        return {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          statusText: r.status === 404 ? 'Not Found' : 'OK',
          headers: { get: () => null },
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        } as unknown as Response;
      });
    }

    afterEach(() => vi.restoreAllMocks());

    it('downloads main branch archive and extracts skills', async () => {
      const zip = makeZip({ 'test-skill-main/SKILL.md': SKILL_MD });
      const spy = mockFetch([{ status: 200, buffer: zip }]);
      const previews = await svc.previewFromUrl('https://github.com/VaLeXaR/test-skill');
      expect(previews).toHaveLength(1);
      expect(previews[0]?.name).toBe('Test Skill');
      expect(spy.mock.calls[0]![0] as string).toContain('/archive/refs/heads/main.zip');
    });

    it('falls back to master archive when main returns 404', async () => {
      const zip = makeZip({ 'test-skill-master/SKILL.md': SKILL_MD });
      const spy = mockFetch([{ status: 404 }, { status: 200, buffer: zip }]);
      const previews = await svc.previewFromUrl('https://github.com/VaLeXaR/test-skill');
      expect(previews).toHaveLength(1);
      expect(spy.mock.calls).toHaveLength(2);
      expect(spy.mock.calls[1]![0] as string).toContain('/archive/refs/heads/master.zip');
    });

    it('throws when both main and master archives return 404', async () => {
      mockFetch([{ status: 404 }, { status: 404 }]);
      await expect(svc.previewFromUrl('https://github.com/VaLeXaR/test-skill')).rejects.toThrow(
        'Repository not found',
      );
    });

    it('handles repos with multiple skill subdirectories', async () => {
      const zip = makeZip({
        'test-skill-main/skill-a/SKILL.md': '---\nname: Skill A\n---\nA body',
        'test-skill-main/skill-b/SKILL.md': '---\nname: Skill B\n---\nB body',
      });
      mockFetch([{ status: 200, buffer: zip }]);
      const previews = await svc.previewFromUrl('https://github.com/VaLeXaR/test-skill');
      expect(previews).toHaveLength(2);
    });

    it('repo root URL with trailing slash is handled', async () => {
      const zip = makeZip({ 'test-skill-main/SKILL.md': SKILL_MD });
      const spy = mockFetch([{ status: 200, buffer: zip }]);
      await svc.previewFromUrl('https://github.com/VaLeXaR/test-skill/');
      expect(spy.mock.calls[0]![0] as string).toContain('VaLeXaR/test-skill/archive/refs/heads/main.zip');
    });

    it('blob URL still fetches as raw text (not archive)', async () => {
      const spy = vi.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: (h: string) => (h === 'content-type' ? 'text/plain' : null) },
        text: async () => SKILL_MD,
      } as unknown as Response));
      const previews = await svc.previewFromUrl('https://github.com/VaLeXaR/test-skill/blob/main/SKILL.md');
      expect(previews).toHaveLength(1);
      expect(spy.mock.calls[0]![0] as string).toBe(
        'https://raw.githubusercontent.com/VaLeXaR/test-skill/main/SKILL.md',
      );
    });
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
