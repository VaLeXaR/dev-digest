import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretsProvider, SecretKey } from '@devdigest/shared';

/**
 * LocalSecretsProvider — writable MVP secrets backend.
 *
 * Reads stored overrides from a JSON file on disk (BYO keys entered via the
 * UI), falling back to process.env when a key has not been set. Writes persist
 * to the same file (mode 0600) so keys survive restarts. GITHUB_TOKEN is the
 * canonical key; GITHUB_PAT is still read as a fallback for back-compat.
 *
 * Stored values take precedence over env so a key entered in the UI wins.
 * Swap for a VaultSecretsProvider later without touching call sites.
 *
 * The in-memory cache is keyed on the file's mtime, so a token changed on disk
 * — by the UI's `set()`, OR by a *different* process sharing the same
 * `~/.devdigest/secrets.json` — is picked up on the next `get()` without a
 * restart. (A single hardcoded cache used to pin the token a process read at
 * boot: a BYO key re-entered in the UI would only reach the process that
 * handled the save, leaving other server processes authenticating with the
 * stale token until restarted.)
 */
export class LocalSecretsProvider implements SecretsProvider {
  private cache: Record<string, string> | null = null;
  /** mtime (ms) of the file backing `cache`; -1 while unloaded. */
  private cacheMtimeMs = -1;

  constructor(
    private readonly filePath: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private async load(): Promise<Record<string, string>> {
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(this.filePath)).mtimeMs;
    } catch {
      // Missing/unreadable file → no stored overrides. Keep any prior cache
      // (e.g. a transient stat failure) rather than wiping it.
      if (this.cache) return this.cache;
      this.cache = {};
      return this.cache;
    }
    if (this.cache && mtimeMs === this.cacheMtimeMs) return this.cache;
    let data: Record<string, string> = {};
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, string>;
    } catch {
      // File exists but is malformed → treat as no overrides.
    }
    this.cache = data;
    this.cacheMtimeMs = mtimeMs;
    return data;
  }

  async get(key: SecretKey): Promise<string | undefined> {
    const stored = (await this.load())[key as string];
    if (stored) return stored;
    if (key === 'GITHUB_TOKEN') return this.env.GITHUB_TOKEN ?? this.env.GITHUB_PAT;
    return this.env[key as string];
  }

  async set(key: SecretKey, value: string): Promise<void> {
    const data = await this.load();
    data[key as string] = value;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    // Keep the in-process cache authoritative for our own write and record the
    // new mtime so the next get() doesn't needlessly re-read the file we just
    // wrote (a genuine later external write bumps mtime again and reloads).
    this.cache = data;
    try {
      this.cacheMtimeMs = (await stat(this.filePath)).mtimeMs;
    } catch {
      // If we can't stat right after writing, force a reload next time.
      this.cacheMtimeMs = -1;
    }
  }
}
