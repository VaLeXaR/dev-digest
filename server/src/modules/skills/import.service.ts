import { unzipSync, strFromU8 } from 'fflate';
import type { SkillPreview, SkillType } from '@devdigest/shared';

const PRIVATE_IP_RE =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc00:|fd)/i;
const VALID_TYPES: SkillType[] = ['rubric', 'convention', 'security', 'custom'];

export class SkillsImportService {
  async previewFromBuffer(buffer: Buffer, filename: string): Promise<SkillPreview[]> {
    if (filename.toLowerCase().endsWith('.zip')) {
      return this.previewFromZip(buffer);
    }
    return [this.parseMdText(buffer.toString('utf8'), filename, 'imported_file')];
  }

  async previewFromUrl(rawUrl: string): Promise<SkillPreview[]> {
    if (!/^https?:\/\//i.test(rawUrl)) throw new Error('URL must start with http:// or https://');
    const url = normalizeGitHubUrl(rawUrl);
    const { hostname } = new URL(url);
    if (PRIVATE_IP_RE.test(hostname)) throw new Error('URL hostname not allowed (private IP)');

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) throw new Error('URL returned an HTML page. Paste the raw file URL (or a GitHub blob URL — it will be converted automatically).');
    if (!ct.includes('text/')) throw new Error('URL must return a plain text file');

    const text = await res.text();
    const filename = url.split('/').at(-1) ?? 'skill.md';
    return [this.parseMdText(text, filename, 'imported_url')];
  }

  private previewFromZip(buffer: Buffer): SkillPreview[] {
    const files = unzipSync(new Uint8Array(buffer));
    const results: SkillPreview[] = [];
    for (const [name, data] of Object.entries(files)) {
      if (name.includes('..') || name.startsWith('/')) continue;
      if (!name.toLowerCase().endsWith('.md')) continue;
      const basename = name.split('/').at(-1) ?? name;
      results.push(this.parseMdText(strFromU8(data), basename, 'imported_file'));
    }
    if (results.length === 0) throw new Error('No .md files found in the archive');
    return results;
  }

  private parseMdText(text: string, filename: string, source: SkillPreview['source']): SkillPreview {
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
      const fm = parseFrontmatter(fmMatch[1]!);
      const body = fmMatch[2]!.trim();
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
    }
    return { name: filenameToName(filename), description: '', type: 'custom', body: text.trim(), source, filename };
  }
}

function normalizeGitHubUrl(url: string): string {
  // https://github.com/{user}/{repo}/blob/{branch}/{...path}
  // → https://raw.githubusercontent.com/{user}/{repo}/{branch}/{...path}
  const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}`;
  return url;
}

function filenameToName(filename: string): string {
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

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
