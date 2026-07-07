import { describe, it, expect } from "vitest";
import { translateBaseLineToHead } from "./translateLine";

describe("translateBaseLineToHead", () => {
  it("returns the line unchanged when there is no patch", () => {
    expect(translateBaseLineToHead(null, 26)).toBe(26);
    expect(translateBaseLineToHead(undefined, 26)).toBe(26);
    expect(translateBaseLineToHead("", 26)).toBe(26);
  });

  it("returns the line unchanged when it's entirely before every hunk", () => {
    const patch = "@@ -50,2 +50,4 @@\n ctx\n+added";
    expect(translateBaseLineToHead(patch, 10)).toBe(10);
  });

  it("shifts a line entirely after a hunk that adds lines (extract.test.ts regression)", () => {
    // Real shape from PR #8: two new imports added at rows 4-9, shifting
    // everything below down by 2. The indexed caller line (26, from the
    // repo's default branch) must land on line 28 in the PR's head version.
    const patch = "@@ -4,6 +4,8 @@ import {\n   extractReferences,\n+  extractExportedConstStrings,\n+  resolveJobKindLabels,\n } from '../src/adapters/codeindex/extract.js';";
    expect(translateBaseLineToHead(patch, 26)).toBe(28);
  });

  it("accumulates offset across multiple preceding hunks", () => {
    const patch = [
      "@@ -4,2 +4,4 @@", // +2
      " a",
      "+b",
      "+c",
      " d",
      "@@ -20,2 +22,1 @@", // -1
      "-e",
      " f",
    ].join("\n");
    // Before either hunk: unaffected.
    expect(translateBaseLineToHead(patch, 3)).toBe(3);
    // Between the two hunks (old line 10): +2 from hunk 1 only.
    expect(translateBaseLineToHead(patch, 10)).toBe(12);
    // After both hunks (old line 30): +2 then -1 = +1 net.
    expect(translateBaseLineToHead(patch, 30)).toBe(31);
  });

  it("maps proportionally within a hunk instead of snapping to its start (page.tsx regression)", () => {
    // Real shape from PR #8: a single old line (151) rewritten into 3 new
    // lines (151-153). Snapping to newStart (148) would move AWAY from the
    // correct spot; proportional mapping reproduces the existing (correct)
    // behavior of landing back on 151.
    const patch = [
      "@@ -148,7 +148,9 @@ export default function PRDetailPage() {",
      "       />",
      "",
      "       <div>",
      "-        {tab === \"overview\" && <OverviewTab prBody={pr.body} prId={prId ?? \"\"} />}",
      "+        {tab === \"overview\" && (",
      "+          <OverviewTab prBody={pr.body} prId={prId ?? \"\"} onGoToDiff={handleGoToDiff} />",
      "+        )}",
      "",
      "        {tab === \"findings\" && (",
    ].join("\n");
    expect(translateBaseLineToHead(patch, 151)).toBe(151);
  });

  it("clamps the proportional offset to the hunk's new range when it shrinks", () => {
    const patch = "@@ -10,5 +10,1 @@\n-a\n-b\n-c\n-d\n+e";
    // Old line 14 (the last of 5 old lines) would be relativeOffset=4, but
    // the new hunk only has 1 line — clamp instead of returning newStart+4.
    expect(translateBaseLineToHead(patch, 14)).toBe(10);
  });
});
