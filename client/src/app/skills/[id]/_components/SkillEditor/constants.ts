import type { IconName } from "@devdigest/ui";

export interface EditorTab {
  key: string;
  label: string;
  icon: IconName;
}

export const TABS: readonly EditorTab[] = [
  { key: "config", label: "Config", icon: "Settings" },
  { key: "preview", label: "Preview", icon: "Eye" },
  { key: "context", label: "Context", icon: "FileText" },
  { key: "stats", label: "Stats", icon: "BarChart" },
  { key: "versions", label: "Versions", icon: "History" },
];

export const VALID_TABS = TABS.map((t) => t.key);
