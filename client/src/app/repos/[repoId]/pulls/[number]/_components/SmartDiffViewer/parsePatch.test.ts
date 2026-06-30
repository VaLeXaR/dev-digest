import { describe, it, expect } from "vitest";
import { parsePatch } from "./parsePatch";

describe("parsePatch", () => {
  it("returns [] for null/empty", () => {
    expect(parsePatch(null)).toEqual([]);
    expect(parsePatch("")).toEqual([]);
  });

  it("parses a single hunk", () => {
    const patch = "@@ -1,3 +1,4 @@\n context\n+added\n-removed\n context2";
    const lines = parsePatch(patch);
    // context line: type=" ", lineNo=1
    expect(lines[0]).toMatchObject({ type: " ", lineNo: 1 });
    // addition: type="+", lineNo=2
    expect(lines[1]).toMatchObject({ type: "+", lineNo: 2 });
    // deletion: type="-", lineNo: null
    expect(lines[2]).toMatchObject({ type: "-", lineNo: null });
    // second context: lineNo=3
    expect(lines[3]).toMatchObject({ type: " ", lineNo: 3 });
  });

  it("tracks line numbers across multiple hunks", () => {
    const patch = "@@ -1,1 +1,1 @@\n ctx\n@@ -10,1 +10,1 @@\n+second";
    const lines = parsePatch(patch);
    expect(lines[0]!.lineNo).toBe(1);  // first hunk context
    expect(lines[1]!.lineNo).toBe(10); // second hunk starts at new line 10
  });
});
