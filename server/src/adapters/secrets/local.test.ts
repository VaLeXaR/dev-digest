import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSecretsProvider } from './local.js';

const dirs: string[] = [];

async function tempFile(contents?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dd-secrets-'));
  dirs.push(dir);
  const file = join(dir, 'secrets.json');
  if (contents !== undefined) await writeFile(file, contents);
  return file;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('LocalSecretsProvider', () => {
  it('returns a stored value over the env fallback', async () => {
    const file = await tempFile(JSON.stringify({ GITHUB_TOKEN: 'stored-tok' }));
    const p = new LocalSecretsProvider(file, { GITHUB_TOKEN: 'env-tok' });
    expect(await p.get('GITHUB_TOKEN')).toBe('stored-tok');
  });

  it('falls back to env (incl. GITHUB_PAT back-compat) when unset on disk', async () => {
    const missing = join(tmpdir(), 'dd-secrets-does-not-exist', 'secrets.json');
    expect(await new LocalSecretsProvider(missing, { GITHUB_TOKEN: 'env-tok' }).get('GITHUB_TOKEN')).toBe('env-tok');
    expect(await new LocalSecretsProvider(missing, { GITHUB_PAT: 'pat-tok' }).get('GITHUB_TOKEN')).toBe('pat-tok');
  });

  it('reloads a token changed on disk by another process (mtime-keyed cache)', async () => {
    const file = await tempFile(JSON.stringify({ GITHUB_TOKEN: 'tok-A' }));
    const p = new LocalSecretsProvider(file, {});
    expect(await p.get('GITHUB_TOKEN')).toBe('tok-A'); // primes the cache

    // Simulate a different process (or the UI) overwriting the file, then bump
    // the mtime so the change is unambiguously newer than the cached read.
    await writeFile(file, JSON.stringify({ GITHUB_TOKEN: 'tok-B' }));
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);

    expect(await p.get('GITHUB_TOKEN')).toBe('tok-B'); // picked up without restart
  });

  it('persists set() to disk and serves it from cache', async () => {
    const file = await tempFile(JSON.stringify({ GITHUB_TOKEN: 'keep-me' }));
    const p = new LocalSecretsProvider(file, {});
    await p.set('OPENAI_API_KEY', 'sk-new');
    expect(await p.get('OPENAI_API_KEY')).toBe('sk-new');
    expect(await p.get('GITHUB_TOKEN')).toBe('keep-me'); // existing keys preserved
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk).toMatchObject({ GITHUB_TOKEN: 'keep-me', OPENAI_API_KEY: 'sk-new' });
  });

  it('treats a malformed file as no overrides and uses env', async () => {
    const file = await tempFile('{ this is not json');
    const p = new LocalSecretsProvider(file, { OPENAI_API_KEY: 'env-key' });
    expect(await p.get('OPENAI_API_KEY')).toBe('env-key');
  });
});
