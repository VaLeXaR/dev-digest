import { Intent } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';

// ---------- T-01: Pure helpers -----------------------------------------------

/**
 * Returns only hunk-header lines (matching /^@@.+@@/) from a patch string.
 * Returns [] when patch is null or empty.
 */
export function extractHunkHeaders(patch: string | null): string[] {
  if (!patch) return [];
  return patch.split('\n').filter((line) => /^@@.+@@/.test(line));
}

/**
 * Builds the full prompt text for the flash model from PR metadata and file
 * diffs. Omits sections whose input is null or empty — never throws and never
 * returns an empty string (title alone is always included).
 *
 * Multi-line strings are built as arrays joined with '\n' to avoid the
 * Edit-tool ASCII-quote → curly-quote corruption described in INSIGHTS.md.
 */
export function buildIntentInput(args: {
  title: string;
  body: string | null;
  planContent: string | null;
  issue: { title: string; body: string | null } | null;
  files: { path: string; patch: string | null }[];
}): string {
  const parts: string[] = [];

  // PR title — always present
  parts.push(['PR Title:', args.title].join(' '));

  // PR body — omit section entirely when null or empty
  if (args.body) {
    parts.push(['', 'PR Body:', args.body].join('\n'));
  }

  // Plan / Specification — omit when null
  if (args.planContent) {
    parts.push(['', 'Plan / Specification:', args.planContent].join('\n'));
  }

  // Linked issue — omit when null
  if (args.issue) {
    const issueLines: string[] = ['', 'Linked Issue:', args.issue.title];
    if (args.issue.body) {
      issueLines.push(args.issue.body);
    }
    parts.push(issueLines.join('\n'));
  }

  // Per-file blocks with hunk headers only (no patch body lines)
  if (args.files.length > 0) {
    const fileBlocks: string[] = ['', 'Changed Files:'];
    for (const file of args.files) {
      const headers = extractHunkHeaders(file.patch);
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

/**
 * Rough token estimate: 1 token ≈ 4 characters.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------- T-02: LLM call ---------------------------------------------------

// System prompt built as a string array to avoid Edit-tool quote corruption.
const SYSTEM_PROMPT_PARTS = [
  'You are a PR intent classifier.',
  'Classify the pull request intent and return ONLY valid JSON with this shape:',
  '{ "intent": string, "in_scope": string[], "out_of_scope": string[] }',
  'intent: one sentence describing what the PR does.',
  'in_scope: list of concerns explicitly addressed by this PR.',
  'out_of_scope: list of related concerns explicitly NOT addressed.',
  'Return no other text — only the JSON object.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_PARTS.join(' ');

const SAFE_DEFAULT: Intent = Intent.parse({
  intent: '',
  in_scope: [],
  out_of_scope: [],
});

/**
 * Calls the LLM to classify PR intent.
 *
 * Uses complete() (not completeStructured()) so that schema-mismatch never
 * throws — per the safe-default contract described in INSIGHTS.md.
 *
 * On any failure (empty text, missing JSON brackets, parse error, Zod
 * validation error) returns the safe default rather than propagating.
 */
export async function callIntentLLM(
  input: string,
  llm: LLMProvider,
  model: string,
): Promise<{ intent: Intent; tokensIn: number }> {
  const tokensIn = estimateTokens(input);

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
    return { intent: SAFE_DEFAULT, tokensIn };
  }

  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');

  if (objStart === -1 || objEnd <= objStart) {
    return { intent: SAFE_DEFAULT, tokensIn };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(objStart, objEnd + 1));
  } catch {
    return { intent: SAFE_DEFAULT, tokensIn };
  }

  const validation = Intent.safeParse(parsed);
  if (!validation.success) {
    return { intent: SAFE_DEFAULT, tokensIn };
  }

  return { intent: validation.data, tokensIn };
}
