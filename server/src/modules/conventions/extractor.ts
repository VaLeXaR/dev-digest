import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { LLMProvider } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';

// ---------- Types -----------------------------------------------------------

export interface FileSample {
  path: string;    // relative to repo root
  content: string;
}

export interface RawCandidate {
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;     // 0.0 – 1.0
}

// Convenience alias used by callLLM's parameter type
type LlmAdapter = LLMProvider;

// ---------- Constants -------------------------------------------------------

const CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  '.editorconfig',
  'biome.json',
  'biome.jsonc',
];

const MAX_FILE_CHARS = 4000;

// Directories to skip when scanning subdirs for config files
const JUNK_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', 'out', 'tmp', '.cache', 'vendor',
]);

// ---------- Step 1 — buildSamples -------------------------------------------

/**
 * Collect file contents from the cloned repo.
 *
 * 1. Reads well-known config files from root AND immediate subdirectories
 *    (handles monorepos where configs live in client/, server/, etc.).
 * 2. Calls repoIntel.getConventionSamples() for top-ranked source files.
 * 3. Returns all successfully-read files as FileSample[].
 *    Files over 4000 chars are truncated to control token count.
 */
export async function buildSamples(
  repoPath: string,
  repoId: string,
  repoIntel: RepoIntel,
): Promise<FileSample[]> {
  const samples: FileSample[] = [];

  // 1. Config files — search root + immediate non-junk subdirs
  const searchDirs: string[] = [repoPath];
  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !JUNK_DIRS.has(entry.name)) {
        searchDirs.push(path.join(repoPath, entry.name));
      }
    }
  } catch { /* can't list root — proceed with root only */ }

  const resolvedRepo = path.resolve(repoPath);
  for (const dir of searchDirs) {
    for (const filename of CONFIG_FILES) {
      const fullPath = path.join(dir, filename);
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(resolvedRepo + path.sep) && resolved !== resolvedRepo) continue;
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        samples.push({
          path: path.relative(repoPath, fullPath),
          content: raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) : raw,
        });
      } catch {
        // File doesn't exist or can't be read — silently skip
      }
    }
  }

  // 2. Top-ranked source files from repo intel
  let relativePaths: string[] = [];
  try {
    relativePaths = await repoIntel.getConventionSamples(repoId, 12);
  } catch (err) {
    console.warn(`[conventions] getConventionSamples failed: ${(err as Error).message}`);
  }

  for (const relPath of relativePaths) {
    const fullPath = path.join(repoPath, relPath);
    if (!path.resolve(fullPath).startsWith(path.resolve(repoPath))) continue;
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      samples.push({
        path: relPath,
        content: raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) : raw,
      });
    } catch (err) {
      console.warn(`[conventions] could not read sample file ${relPath}: ${(err as Error).message}`);
    }
  }

  return samples;
}

// ---------- Step 2 — callLLM ------------------------------------------------

const SYSTEM_PROMPT = `You are a code-convention analyst. Analyze the provided code samples and \
extract concrete coding conventions consistently followed in this repository.
Return ONLY conventions that: have clear evidence in the provided files, \
can be formulated as a specific actionable rule (start with Always/Never/Use X \
instead of Y), appear in at least 2 places or are configured explicitly, \
would be useful for a code reviewer to enforce.
Do NOT include generic best practices obvious to any experienced developer, \
things with only 1 example unless in a config file, or framework defaults.`;

function buildUserPrompt(samples: FileSample[], repoName: string): string {
  const fileContents = samples
    .map((s) => `=== ${s.path} ===\n${s.content}`)
    .join('\n\n');

  return `Repository: ${repoName}
Analyze these files and extract coding conventions:
${fileContents}
Return JSON with candidates array: rule (imperative form), evidence_path (relative path), evidence_snippet (2-5 lines of exact code), confidence (0.0-1.0). Only include conventions with confidence > 0.6.`;
}

// Zod schema for one LLM-returned candidate (snake_case field names as prompted)
const LlmCandidateSchema = z.object({
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z
    .union([z.number(), z.string()])
    .transform((v) => Math.max(0, Math.min(1, Number(v) || 0))),
});

/**
 * Call the LLM to extract conventions from the file samples.
 *
 * Uses the `complete()` method on the LLMProvider (plain text completion),
 * then JSON-parses and Zod-validates the response. Returns [] on any parse
 * error — the service layer handles empty results gracefully.
 */
export async function callLLM(
  samples: FileSample[],
  llm: LlmAdapter,
  model: string,
  provider: string,
  repoName: string,
): Promise<RawCandidate[]> {
  // provider is used for logging context; the llm adapter is already resolved
  void provider;

  const userPrompt = buildUserPrompt(samples, repoName);

  // API errors (bad key, network, rate-limit) propagate — only JSON parse errors return [].
  const result = await llm.complete({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 2048,
  });
  const text = result.text;

  if (!text.trim()) {
    console.warn('[conventions] LLM returned empty content — model may not support plain-text completion (e.g. reasoning-only models). Switch model in Settings.');
    return [];
  }

  // Extract first JSON array from anywhere in the response.
  // Models often prepend explanatory text before the JSON — a start-anchored
  // strip fails silently. Find the first '[' … last ']' instead.
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  const jsonText = arrayStart !== -1 && arrayEnd > arrayStart
    ? text.slice(arrayStart, arrayEnd + 1)
    : text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];

    const candidates: RawCandidate[] = [];
    for (const item of parsed) {
      const parsed = LlmCandidateSchema.safeParse(item);
      if (!parsed.success) continue;
      const d = parsed.data;
      candidates.push({
        rule: d.rule,
        evidencePath: d.evidence_path,
        evidenceSnippet: d.evidence_snippet,
        confidence: d.confidence,
      });
    }
    return candidates;
  } catch {
    console.warn('[conventions] failed to parse LLM JSON response');
    return [];
  }
}

// ---------- Step 3 — verifyEvidence -----------------------------------------

/**
 * Validate that LLM-reported evidence actually exists in the repo.
 *
 * For each candidate:
 * 1. Check the file exists on disk (path traversal guard applied first).
 * 2. Check that the first line of evidenceSnippet literally appears anywhere in the file.
 * 3. Discard candidates that fail either check.
 */
export async function verifyEvidence(
  candidates: RawCandidate[],
  repoPath: string,
): Promise<RawCandidate[]> {
  const verified: RawCandidate[] = [];

  for (const candidate of candidates) {
    const fullPath = path.join(repoPath, candidate.evidencePath);

    // Guard against path traversal from LLM-generated evidencePath
    const resolvedFull = path.resolve(fullPath);
    const resolvedRepo = path.resolve(repoPath);
    if (!resolvedFull.startsWith(resolvedRepo + path.sep) && resolvedFull !== resolvedRepo) {
      continue; // discard — path escapes repo root
    }

    if (!fs.existsSync(fullPath)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    // Check that the first line of the snippet literally exists anywhere in the file
    const firstLine = candidate.evidenceSnippet.split('\n')[0]?.trim() ?? '';
    if (!firstLine || !content.includes(firstLine)) {
      continue;
    }

    verified.push(candidate);
  }

  return verified;
}
