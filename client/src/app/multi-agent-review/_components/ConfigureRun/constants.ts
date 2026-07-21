import type { IconName } from "@devdigest/ui";

/**
 * Local name → category icon/color heuristic (design/03.png shows a distinct
 * colored icon per agent row). The `Agent` contract carries no category field
 * (`client/src/vendor/shared/contracts/knowledge.ts`), so this is presentational
 * only — unmatched agent names fall back to `DEFAULT_AGENT_CATEGORY`, never a
 * fabricated backend value.
 */
export const AGENT_CATEGORY_STYLES: { pattern: RegExp; icon: IconName; color: string }[] = [
  { pattern: /security/i, icon: "Shield", color: "#ef4444" },
  { pattern: /performance/i, icon: "Zap", color: "#f59e0b" },
  { pattern: /mentor/i, icon: "Lightbulb", color: "#3b82f6" },
  { pattern: /customer/i, icon: "Users", color: "#8b5cf6" },
  { pattern: /architect/i, icon: "Layers", color: "#22c55e" },
];

export const DEFAULT_AGENT_CATEGORY: { icon: IconName; color: string } = {
  icon: "Cpu",
  color: "var(--text-secondary)",
};

export function agentCategoryStyle(name: string): { icon: IconName; color: string } {
  return AGENT_CATEGORY_STYLES.find((c) => c.pattern.test(name)) ?? DEFAULT_AGENT_CATEGORY;
}
