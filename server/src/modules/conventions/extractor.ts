import * as fs from 'node:fs';
import * as path from 'node:path';
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
  evidenceLine: number;   // 1-based line number (used only for verification)
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
];

const MAX_FILE_CHARS = 4000;

// ---------- Step 1 — buildSamples -------------------------------------------

/**
 * Collect file contents from the cloned repo.
 *
 * 1. Reads well-known config files (skip if missing).
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

  // 1. Config files
  for (const relPath of CONFIG_FILES) {
    const fullPath = path.join(repoPath, relPath);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      samples.push({
        path: relPath,
        content: raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) : raw,
      });
    } catch {
      // File doesn't exist or can't be read — silently skip
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

const SYSTEM_PROMPT = `You are a code convention analyst. Given file samples from a software repository,
identify recurring coding conventions the team follows.
Return ONLY valid JSON — an array of convention objects.
Do not include markdown, explanation, or any text outside the JSON array.`;

function buildUserPrompt(samples: FileSample[]): string {
  const filesSection = samples
    .map((s) => `=== ${s.path} ===\n${s.content}`)
    .join('\n\n');

  return `Analyze these files and extract up to 10 coding conventions.
Return a JSON array with this exact shape:
[
  {
    "rule": "Short imperative description of the convention",
    "evidencePath": "relative/path/to/file.ts",
    "evidenceLine": 42,
    "evidenceSnippet": "the exact code line or 2-3 lines showing the convention",
    "confidence": 0.85
  }
]

Only include conventions that appear in at least 2 files or are explicitly configured.
Only return rules with direct evidence in the provided files.
Confidence should be 0.0-1.0 based on how consistently the pattern appears.

Files:
${filesSection}`;
}

/**
 * Call the LLM to extract conventions from the file samples.
 *
 * Uses the `complete()` method on the LLMProvider (plain text completion),
 * then JSON-parses the response. Returns [] on any parse error — the service
 * layer handles empty results gracefully.
 */
export async function callLLM(
  samples: FileSample[],
  llm: LlmAdapter,
  model: string,
  provider: string,
): Promise<RawCandidate[]> {
  // provider is used for logging context; the llm adapter is already resolved
  void provider;

  const userPrompt = buildUserPrompt(samples);

  let text: string;
  try {
    const result = await llm.complete({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 2048,
    });
    text = result.text;
  } catch (err) {
    console.warn(`[conventions] LLM call failed: ${(err as Error).message}`);
    return [];
  }

  // Strip markdown code fences if the model wraps the JSON anyway
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    const parsed: unknown = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];

    // Validate shape — discard malformed entries rather than throwing
    const candidates: RawCandidate[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).rule === 'string' &&
        typeof (item as Record<string, unknown>).evidencePath === 'string' &&
        typeof (item as Record<string, unknown>).evidenceLine === 'number' &&
        typeof (item as Record<string, unknown>).evidenceSnippet === 'string' &&
        (typeof (item as Record<string, unknown>).confidence === 'number' ||
          typeof (item as Record<string, unknown>).confidence === 'string')
      ) {
        const i = item as Record<string, unknown>;
        candidates.push({
          rule: i.rule as string,
          evidencePath: i.evidencePath as string,
          evidenceLine: i.evidenceLine as number,
          evidenceSnippet: i.evidenceSnippet as string,
          confidence: Math.max(0, Math.min(1, Number(i.confidence) || 0)),
        });
      }
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
 * 1. Check the file exists on disk.
 * 2. Search for evidenceSnippet (trimmed) within ±5 lines of evidenceLine.
 * 3. Discard candidates whose evidence cannot be found.
 * 4. Return verified candidates with evidenceLine stripped.
 */
export async function verifyEvidence(
  candidates: RawCandidate[],
  repoPath: string,
): Promise<Array<Omit<RawCandidate, 'evidenceLine'>>> {
  const verified: Array<Omit<RawCandidate, 'evidenceLine'>> = [];

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

    let lines: string[];
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      lines = content.split('\n');
    } catch {
      continue;
    }

    // evidenceLine is 1-based; convert to 0-based index
    const centerIdx = candidate.evidenceLine - 1;
    const start = Math.max(0, centerIdx - 5);
    const end = Math.min(lines.length - 1, centerIdx + 5);

    const snippet = candidate.evidenceSnippet.trim();
    let found = false;

    for (let i = start; i <= end; i++) {
      if (lines[i]?.includes(snippet)) {
        found = true;
        break;
      }
    }

    // Also check multi-line snippets — try if the snippet spans multiple lines
    if (!found && snippet.includes('\n')) {
      const snippetLines = snippet.split('\n');
      outer: for (let i = start; i <= end - snippetLines.length + 1; i++) {
        for (let j = 0; j < snippetLines.length; j++) {
          if (!lines[i + j]?.includes(snippetLines[j]!.trim())) {
            continue outer;
          }
        }
        found = true;
        break;
      }
    }

    if (!found) {
      continue;
    }

    // Strip evidenceLine before returning
    const { evidenceLine: _evidenceLine, ...rest } = candidate;
    void _evidenceLine;
    verified.push(rest);
  }

  return verified;
}
