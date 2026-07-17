import type { ExpectedFinding } from "@devdigest/shared";
import type { SkillExpectedFindingDraft } from "./skillExpectedOutput";

/** Modal width (px) — wide enough for the two-column Input / Expected-output layout (design/05). */
export const MODAL_WIDTH = 960;

export type InputTabKey = "diff" | "files" | "prMeta" | "code";

/** Default skeleton entry appended by "+ Finding skeleton" (R15/AC-23 — type is user-editable). */
export function findingSkeleton(): ExpectedFinding {
  return { type: "must_find", file: "", start_line: 1, end_line: 1 };
}

/**
 * Skill variant (R11/T-07) — the short shape the designs show for "+ Finding
 * skeleton": no `file`, no `type` key at all. `parseSkillExpectedOutput`
 * supplies both defaults (`file: SNIPPET_FILENAME`, `type: "must_find"`) on
 * save/badge-check. Do NOT inline `"snippet.ts"` here (R12's single-definition
 * rule) — the skeleton deliberately omits `file` entirely.
 */
export function findingSkillSkeleton(): SkillExpectedFindingDraft {
  return { start_line: 1, end_line: 1 };
}
