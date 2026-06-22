import type { Skill } from "@devdigest/shared";

export function typeColor(type: Skill["type"]): string {
  switch (type) {
    case "rubric":
      return "var(--accent)";
    case "convention":
      return "#22c55e";
    case "security":
      return "#ef4444";
    case "custom":
      return "var(--text-secondary)";
  }
}

export function sourceLabel(source: Skill["source"]): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "imported_url":
      return "Imported";
    case "imported_file":
      return "Imported";
    case "extracted":
      return "Extracted";
    case "community":
      return "Community";
  }
}
