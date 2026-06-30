import type { SmartDiffRole } from "@devdigest/shared";
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from "./constants.js";

export function classifyFile(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((re) => re.test(path))) return "boilerplate";
  if (WIRING_PATTERNS.some((re) => re.test(path))) return "wiring";
  return "core";
}

export function classifyFiles<T extends { path: string }>(
  files: T[]
): Map<SmartDiffRole, T[]> {
  const map = new Map<SmartDiffRole, T[]>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const bucket = map.get(role) ?? [];
    bucket.push(file);
    map.set(role, bucket);
  }
  return map;
}
