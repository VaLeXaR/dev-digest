import type { Skill } from "@devdigest/shared";

export function typeColor(type: Skill["type"]): string {
  switch (type) {
    case "rubric":
      return "#6366f1";
    case "convention":
      return "#22c55e";
    case "security":
      return "#ef4444";
    case "custom":
      return "#71717a";
  }
}

export type SourceInfo = { label: string; icon: "Edit" | "Link" | "Globe" | "Upload" };

export function sourceInfo(source: Skill["source"]): SourceInfo {
  switch (source) {
    case "manual":
      return { label: "Manual", icon: "Edit" };
    case "imported_url":
      return { label: "Imported", icon: "Link" };
    case "imported_file":
      return { label: "Imported", icon: "Upload" };
    case "extracted":
      return { label: "Extracted", icon: "Link" };
    case "community":
      return { label: "Community", icon: "Globe" };
  }
}
