import { describe, it, expect, vi } from "vitest";
import { relativeAgo, computeActiveSection, openGithubBlob } from "./helpers";

describe("relativeAgo", () => {
  it("returns a compact hour string for a timestamp a few hours ago", () => {
    const iso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeAgo(iso)).toBe("2h");
  });

  it("returns '—' for null/invalid input", () => {
    expect(relativeAgo(null)).toBe("—");
    expect(relativeAgo("not-a-date")).toBe("—");
  });
});

describe("computeActiveSection", () => {
  it("picks the last section whose top has scrolled past the offset", () => {
    const tops = [
      { id: "architecture", top: -400 },
      { id: "criticalPaths", top: -50 },
      { id: "runLocally", top: 300 },
      { id: "readingPath", top: 700 },
      { id: "firstTasks", top: 1100 },
    ];
    expect(computeActiveSection(tops)).toBe("criticalPaths");
  });

  it("falls back to the first section when the page is still at the very top", () => {
    const tops = [
      { id: "architecture", top: 200 },
      { id: "criticalPaths", top: 600 },
    ];
    expect(computeActiveSection(tops)).toBe("architecture");
  });

  it("returns null for an empty list", () => {
    expect(computeActiveSection([])).toBeNull();
  });
});

describe("openGithubBlob", () => {
  it("does nothing when repo metadata isn't loaded yet", () => {
    const originalOpen = window.open;
    const spy = vi.fn();
    window.open = spy;
    openGithubBlob(null, null, "src/index.ts");
    expect(spy).not.toHaveBeenCalled();
    window.open = originalOpen;
  });

  it("opens the github blob URL in a new tab when repo metadata is present", () => {
    const originalOpen = window.open;
    const spy = vi.fn();
    window.open = spy;
    openGithubBlob("acme/repo", "main", "src/index.ts");
    expect(spy).toHaveBeenCalledWith(
      "https://github.com/acme/repo/blob/main/src/index.ts",
      "_blank",
      "noopener,noreferrer",
    );
    window.open = originalOpen;
  });
});
