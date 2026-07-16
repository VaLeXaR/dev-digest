import type { ExpectedFinding } from "@devdigest/shared";

/** Modal width (px) — wide enough for the two-column Input / Expected-output layout (design/05). */
export const MODAL_WIDTH = 960;

export type InputTabKey = "diff" | "files" | "prMeta";

/** Default skeleton entry appended by "+ Finding skeleton" (R15/AC-23 — type is user-editable). */
export function findingSkeleton(): ExpectedFinding {
  return { type: "must_find", file: "", start_line: 1, end_line: 1 };
}
