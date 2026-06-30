import { Risks, Risk } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';

// ---------- Pure helpers -----------------------------------------------

/**
 * Builds the full prompt text for the flash model from PR metadata and file
 * diffs. Returns PR Title + optional PR Body + per-file blocks containing
 * hunk-header lines only (lines matching /^@@.+@@/).
 *
 * Multi-line strings are built as arrays joined with '\n' to avoid the
 * Edit-tool ASCII-quote → curly-quote corruption described in INSIGHTS.md.
 */
export function buildRisksInput(args: {
  title: string;
  body: string | null;
  files: { path: string; patch: string | null }[];
}): string {
  const parts: string[] = [];

  // PR title — always present
  parts.push(['PR Title:', args.title].join(' '));

  // PR body — omit section entirely when null or empty
  if (args.body) {
    parts.push(['', 'PR Body:', args.body].join('\n'));
  }

  // Per-file blocks with hunk headers only (no patch body lines)
  if (args.files.length > 0) {
    const fileBlocks: string[] = ['', 'Changed Files:'];
    for (const file of args.files) {
      const headers = file.patch
        ? file.patch.split('\n').filter((line) => /^@@.+@@/.test(line))
        : [];
      const fileLines: string[] = ['', ['File:', file.path].join(' ')];
      if (headers.length > 0) {
        fileLines.push(...headers);
      }
      fileBlocks.push(fileLines.join('\n'));
    }
    parts.push(fileBlocks.join('\n'));
  }

  return parts.join('\n');
}

// ---------- LLM call ---------------------------------------------------

// System prompt built as a string array to avoid Edit-tool quote corruption.
const SYSTEM_PROMPT_PARTS = [
  'You are a PR risk analyser.',
  'Identify risks introduced by this pull request and return ONLY valid JSON with this shape:',
  '{ "risks": [{ "kind": string, "title": string, "severity": "high"|"medium"|"low" }] }',
  'kind: short category label (e.g. "security", "performance", "data-loss").',
  'title: one sentence describing the specific risk.',
  'severity: "high", "medium", or "low".',
  'Return no other text — only the JSON object.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_PARTS.join(' ');

/**
 * Calls the LLM to extract risks from a PR.
 *
 * Uses complete() (not completeStructured()) so that schema-mismatch never
 * throws — per the safe-default contract described in INSIGHTS.md.
 *
 * For each item in parsed.risks: coerces missing explanation to '' and
 * missing file_refs to [] before Risk.safeParse — both fields are required
 * by the Risk schema but the flash model may omit them.
 *
 * On any failure (empty text, missing JSON brackets, parse error, non-array)
 * returns { risks: [] } rather than propagating.
 */
export async function callRisksLLM(
  input: string,
  llm: LLMProvider,
  model: string,
): Promise<Risks> {
  const result = await llm.complete({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input },
    ],
    temperature: 0.2,
    maxTokens: 1024,
  });

  const text = result.text;

  // Guard: reasoning models sometimes return empty content
  if (!text || !text.trim()) {
    return { risks: [] };
  }

  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');

  if (objStart === -1 || objEnd <= objStart) {
    return { risks: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(objStart, objEnd + 1));
  } catch {
    return { risks: [] };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)['risks'])
  ) {
    return { risks: [] };
  }

  const rawRisks = (parsed as Record<string, unknown>)['risks'] as unknown[];

  const kept: Risk[] = [];
  for (const item of rawRisks) {
    if (typeof item !== 'object' || item === null) continue;
    const coerced = {
      ...(item as Record<string, unknown>),
      explanation:
        (item as Record<string, unknown>)['explanation'] !== undefined
          ? (item as Record<string, unknown>)['explanation']
          : '',
      file_refs:
        (item as Record<string, unknown>)['file_refs'] !== undefined
          ? (item as Record<string, unknown>)['file_refs']
          : [],
    };
    const validation = Risk.safeParse(coerced);
    if (validation.success) {
      kept.push(validation.data);
    }
  }

  return { risks: kept };
}
