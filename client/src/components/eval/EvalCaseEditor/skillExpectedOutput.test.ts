import { describe, it, expect } from "vitest";
import { ExpectedFinding } from "@devdigest/shared";
import { parseSkillExpectedOutput } from "./skillExpectedOutput";

const DESIGN_ENTRY_JSON = JSON.stringify([
  {
    title: "Public fields 'name' and 'email' removed from UserResponse without version bump",
    category: "security",
    end_line: 3,
    severity: "CRITICAL",
    start_line: 1,
  },
]);

describe("parseSkillExpectedOutput", () => {
  it("(g) parses the designs' own entry (no file, no type) into a full ExpectedFinding", () => {
    const result = parseSkillExpectedOutput(DESIGN_ENTRY_JSON);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({
      file: "snippet.ts",
      type: "must_find",
      title: "Public fields 'name' and 'email' removed from UserResponse without version bump",
      category: "security",
      end_line: 3,
      severity: "CRITICAL",
      start_line: 1,
    });
  });

  it("(h) an explicit type: must_not_flag is preserved, not overwritten by the default", () => {
    const result = parseSkillExpectedOutput(
      JSON.stringify([{ type: "must_not_flag", start_line: 1, end_line: 2 }]),
    );
    expect(result?.[0]?.type).toBe("must_not_flag");
  });

  it("(i) an explicit file is preserved, not overwritten by the default", () => {
    const result = parseSkillExpectedOutput(
      JSON.stringify([{ file: "other.ts", start_line: 1, end_line: 2 }]),
    );
    expect(result?.[0]?.file).toBe("other.ts");
  });

  it("(j) invalid JSON returns null", () => {
    expect(parseSkillExpectedOutput("not json{")).toBeNull();
  });

  it("(j) valid JSON that is not an array returns null", () => {
    expect(parseSkillExpectedOutput(JSON.stringify({ start_line: 1, end_line: 2 }))).toBeNull();
  });

  it("(k) an entry missing start_line still returns null (leniency scoped to file/type only)", () => {
    expect(parseSkillExpectedOutput(JSON.stringify([{ end_line: 2 }]))).toBeNull();
  });

  it("(l) the strict ExpectedFinding from @devdigest/shared still rejects the case-(g) input", () => {
    const parsed: unknown = JSON.parse(DESIGN_ENTRY_JSON)[0];
    const result = ExpectedFinding.safeParse(parsed);
    expect(result.success).toBe(false);
  });
});
