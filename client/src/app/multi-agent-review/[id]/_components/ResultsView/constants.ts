import type { IconName } from "@devdigest/ui";

/**
 * There is no per-agent "category" in the `Agent` contract (name/provider/model
 * only) — the design's Security/Performance/Junior Mentor/Customer-Facing icons
 * are mockup flavor with no backing data. Rotate a fixed icon+color palette by
 * column index instead of inventing a fake category field (out of this task's
 * Owned paths — `@devdigest/shared` contracts are T-01's, already shipped).
 */
export const COLUMN_PALETTE: readonly { icon: IconName; color: string; bg: string }[] = [
  { icon: "Shield", color: "var(--crit)", bg: "var(--crit-bg)" },
  { icon: "Zap", color: "var(--warn)", bg: "var(--warn-bg)" },
  { icon: "Lightbulb", color: "var(--accent)", bg: "var(--accent-bg)" },
  { icon: "Users", color: "var(--ok)", bg: "var(--ok-bg)" },
];

const DEFAULT_PALETTE_ENTRY = COLUMN_PALETTE[0]!;

export function columnStyleFor(index: number): (typeof COLUMN_PALETTE)[number] {
  return COLUMN_PALETTE[index % COLUMN_PALETTE.length] ?? DEFAULT_PALETTE_ENTRY;
}
