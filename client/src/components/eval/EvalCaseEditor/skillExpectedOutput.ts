import { z } from "zod";
import { ExpectedFinding } from "@devdigest/shared";
import { SNIPPET_FILENAME } from "./generateDiff";

/**
 * Lenient Expected-output schema for the SKILL branch of the modal (R11).
 * Built from `ExpectedFinding`'s own shape (imported from `@devdigest/shared`)
 * so the two cannot drift — only `type` and `file` are overridden, both with
 * `.default()`, so the schema's OUTPUT type is already a full `ExpectedFinding`
 * (Zod performs the normalization; there is no separate hand-written mapping
 * step that could drift). `ExpectedFinding` itself is never modified — `file`
 * and `type` stay required there, and the agent branch keeps validating
 * against it directly.
 */
export const SkillExpectedFinding = z.object({
  ...ExpectedFinding.shape,
  type: ExpectedFinding.shape.type.default("must_find"),
  file: z.string().default(SNIPPET_FILENAME),
});

/** The draft (pre-normalization) shape — `file`/`type` optional, everything else as `ExpectedFinding`. */
export type SkillExpectedFindingDraft = z.input<typeof SkillExpectedFinding>;

const SkillExpectedOutputArray = z.array(SkillExpectedFinding);

/**
 * Mirrors the strict `parseExpectedOutput` (`EvalCaseEditor.tsx:25-33`):
 * `JSON.parse` in a try/catch, then `safeParse` an array of the lenient
 * schema, returning `null` on either failure. What comes back is always a
 * complete `ExpectedFinding[]` — `file: "snippet.ts"` when omitted, `type:
 * "must_find"` when omitted — so scoring downstream is unaffected.
 */
export function parseSkillExpectedOutput(text: string): ExpectedFinding[] | null {
  try {
    const json: unknown = JSON.parse(text);
    const result = SkillExpectedOutputArray.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
