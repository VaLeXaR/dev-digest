import { describe, it, expect } from "vitest";
import { generateDiff, SNIPPET_FILENAME } from "./generateDiff";

describe("generateDiff", () => {
  it("(a) new-file mode emits --- /dev/null + @@ -0,0 +1,N @@ with every After line prefixed +", () => {
    const result = generateDiff({
      mode: "new_file",
      before: "",
      after: "type UserResponse = {\n  id: string;\n}",
    });
    expect(result).toBe(
      [
        `diff --git a/${SNIPPET_FILENAME} b/${SNIPPET_FILENAME}`,
        "new file mode 100644",
        "--- /dev/null",
        `+++ b/${SNIPPET_FILENAME}`,
        "@@ -0,0 +1,3 @@",
        "+type UserResponse = {",
        "+  id: string;",
        "+}",
      ].join("\n"),
    );
  });

  it("(b) modified-file mode reproduces the design/01 example verbatim", () => {
    const before = "type UserResponse = {\n  id: string;\n  name: string;\n  email?: string;\n}";
    const after = "type UserResponse = {\n  id: string;\n}";
    const result = generateDiff({ mode: "modified_file", before, after });
    expect(result).toBe(
      [
        `diff --git a/${SNIPPET_FILENAME} b/${SNIPPET_FILENAME}`,
        `--- a/${SNIPPET_FILENAME}`,
        `+++ b/${SNIPPET_FILENAME}`,
        "@@ -1,5 +1,3 @@",
        " type UserResponse = {",
        "   id: string;",
        "-  name: string;",
        "-  email?: string;",
        " }",
      ].join("\n"),
    );
  });

  it("(c) identical before/after returns empty string", () => {
    const text = "type UserResponse = {\n  id: string;\n}";
    expect(generateDiff({ mode: "modified_file", before: text, after: text })).toBe("");
  });

  it("(c) both-empty returns empty string", () => {
    expect(generateDiff({ mode: "modified_file", before: "", after: "" })).toBe("");
    expect(generateDiff({ mode: "new_file", before: "", after: "" })).toBe("");
  });

  it("(d) a blank context line is emitted as a single space, not an empty string", () => {
    const before = "a\n\nb\nX";
    const after = "a\n\nb\nY";
    const result = generateDiff({ mode: "modified_file", before, after });
    const lines = result.split("\n");
    expect(lines).toContain(" ");
    expect(lines).not.toContain("");
  });

  it("(e) a trailing newline on after does not add a phantom line to the hunk count", () => {
    const before = "line1\nline2";
    const after = "line1\nline2\nline3\n";
    const result = generateDiff({ mode: "modified_file", before, after });
    expect(result).toBe(
      [
        `diff --git a/${SNIPPET_FILENAME} b/${SNIPPET_FILENAME}`,
        `--- a/${SNIPPET_FILENAME}`,
        `+++ b/${SNIPPET_FILENAME}`,
        "@@ -1,2 +1,3 @@",
        " line1",
        " line2",
        "+line3",
      ].join("\n"),
    );
  });

  it("(f) every emitted path equals SNIPPET_FILENAME and the module exports it", () => {
    expect(SNIPPET_FILENAME).toBe("snippet.ts");
    const modified = generateDiff({
      mode: "modified_file",
      before: "a",
      after: "b",
    });
    const newFile = generateDiff({ mode: "new_file", before: "", after: "a" });
    expect(modified).toContain(`a/${SNIPPET_FILENAME}`);
    expect(modified).toContain(`b/${SNIPPET_FILENAME}`);
    expect(newFile).toContain(`b/${SNIPPET_FILENAME}`);
  });
});
