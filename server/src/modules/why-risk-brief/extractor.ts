import { WhyRiskBrief } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';

// ---------- Deterministic safe default -----------------------------------

/** Returned whenever the structured call fails or its payload can't be trusted (AC-8) — never throw. */
const EMPTY_BRIEF: WhyRiskBrief = {
  what: '',
  why: '',
  risk_level: 'low',
  risks: [],
  review_focus: [],
};

/**
 * Result of a single Why+Risk Brief generation call.
 *
 * `reason` is present only on the fallback path (empty/unparseable payload,
 * schema mismatch) — its presence is how the caller (WhyRiskBriefService,
 * T-07) distinguishes "successfully generated" from "fell back to the
 * deterministic empty brief". `brief` is always populated (either the
 * validated+resolved brief, or EMPTY_BRIEF).
 */
export interface WhyRiskBriefLLMResult {
  brief: WhyRiskBrief;
  reason?: string;
}

// ---------- LLM call -------------------------------------------------------

// System prompt built as a string array to avoid Edit-tool quote corruption.
const SYSTEM_PROMPT_PARTS = [
  'You are a PR why-and-risk brief generator.',
  'Given derived facts about a pull request (intent, blast radius, diff statistics, linked issue, related specs), return ONLY valid JSON with exactly this shape:',
  '{ "what": string, "why": string, "risk_level": "high"|"medium"|"low", "risks": [{ "kind": string, "title": string, "explanation": string, "severity": "high"|"medium"|"low", "file_refs": string[] }], "review_focus": [{ "file": string, "line": number, "reason": string }] }',
  'what: one or two sentences describing what the PR changes.',
  'why: one or two sentences describing why the change is needed.',
  'risk_level: the PR overall risk level - "high", "medium", or "low".',
  'risks: notable risks introduced by this PR; each file_refs entry must be a file path or API endpoint string that literally appears in the input.',
  'review_focus: the most important file:line locations a reviewer should look at first, each with a short reason; file must literally appear in the input.',
  'Do not invent file paths or endpoints that are not present in the input.',
  'Return no other text - only the JSON object.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_PARTS.join(' ');

/**
 * Calls the LLM exactly once to generate a Why+Risk Brief, then resolves and
 * validates its output against `resolvableRefs` (the set of file paths and
 * endpoint strings present in the assembled input, computed by the caller).
 *
 * Uses complete() (not completeStructured()) so a schema mismatch never
 * throws — completeStructured() throws on mismatch, which would break the
 * AC-8 "never a 5xx" contract (INSIGHTS.md 2026-06-22).
 *
 * Resolution (post schema-validation, on the already-typed brief):
 *  - AC-6: review_focus[] items whose `file` is not in `resolvableRefs` are
 *    dropped entirely.
 *  - AC-6 + AC-18: each risk's file_refs[] is filtered down to only
 *    resolvable entries, but the risk itself is NEVER dropped — a risk left
 *    with file_refs: [] after filtering is still returned, title/explanation/
 *    severity intact (AC-18).
 *
 * On any failure (empty text, missing JSON brackets, JSON.parse failure, or
 * WhyRiskBrief.safeParse failure) returns { brief: EMPTY_BRIEF, reason }
 * rather than throwing.
 */
export async function callWhyRiskBriefLLM(
  input: string,
  llm: LLMProvider,
  model: string,
  resolvableRefs: Set<string>,
): Promise<WhyRiskBriefLLMResult> {
  const result = await llm.complete({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input },
    ],
    temperature: 0.2,
    maxTokens: 2048,
  });

  const text = result.text;

  // Guard: reasoning models sometimes return empty content — check before
  // attempting bracket extraction.
  if (!text || !text.trim()) {
    return { brief: EMPTY_BRIEF, reason: 'LLM returned an empty response' };
  }

  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');

  if (objStart === -1 || objEnd <= objStart) {
    return { brief: EMPTY_BRIEF, reason: 'LLM response did not contain a JSON object' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(objStart, objEnd + 1));
  } catch {
    return { brief: EMPTY_BRIEF, reason: 'LLM response was not valid JSON' };
  }

  const validation = WhyRiskBrief.safeParse(parsed);
  if (!validation.success) {
    return { brief: EMPTY_BRIEF, reason: 'LLM response did not match the expected brief shape' };
  }

  const brief = validation.data;

  const review_focus = brief.review_focus.filter((item) => resolvableRefs.has(item.file));

  const risks = brief.risks.map((risk) => ({
    ...risk,
    file_refs: risk.file_refs.filter((ref) => resolvableRefs.has(ref)),
  }));

  return { brief: { ...brief, risks, review_focus } };
}
