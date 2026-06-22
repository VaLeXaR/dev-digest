import { describe, it, expect } from 'vitest';
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
});
