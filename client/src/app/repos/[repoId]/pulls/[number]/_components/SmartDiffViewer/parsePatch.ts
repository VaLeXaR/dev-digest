export interface DiffLine {
  type: "+" | "-" | " ";
  content: string;
  lineNo: number | null; // new-file line number; null for deletions
}

export function parsePatch(patch: string | null | undefined): DiffLine[] {
  if (!patch) return [];
  const lines = patch.split("\n");
  const result: DiffLine[] = [];
  let newLine = 0;
  for (const raw of lines) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = parseInt(hunk[1]!, 10);
      continue; // skip hunk header line itself
    }
    if (raw.startsWith("+")) {
      result.push({ type: "+", content: raw.slice(1), lineNo: newLine++ });
    } else if (raw.startsWith("-")) {
      result.push({ type: "-", content: raw.slice(1), lineNo: null });
    } else if (raw.startsWith(" ") || raw === "") {
      result.push({ type: " ", content: raw.slice(1), lineNo: newLine++ });
    }
  }
  return result;
}
