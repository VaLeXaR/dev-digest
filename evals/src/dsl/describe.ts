/**
 * Labeled test groups. Wrapping vitest's `describe` gives every case a tier prefix in the
 * output (skill: / agent: / workflow:), which is both readable and how the statistics layer
 * groups series by tier.
 *
 * A skill/agent eval whose SUBJECT ARTIFACT is absent from the repo (e.g. an A/B variant that
 * was never committed, or a WIP skill) is SKIPPED, not failed: the subject's absence must not
 * block CI. Present artifacts still run and gate normally. The absent branch never calls the
 * body `fn` (so the missing artifact is never loaded), registering one skipped placeholder test.
 */

import { describe, it } from "vitest";
import { agentExists, skillExists } from "../artifacts/load.js";

function guarded(kind: "skill" | "agent", name: string, present: boolean, fn: () => void) {
  const label = `${kind}:${name}`;
  if (present) return describe(label, fn);
  return describe.skip(label, () => {
    it(`${kind} artifact not present in repo — eval skipped`, () => {});
  });
}

export const describeSkill = (name: string, fn: () => void) =>
  guarded("skill", name, skillExists(name), fn);
export const describeAgent = (name: string, fn: () => void) =>
  guarded("agent", name, agentExists(name), fn);
export const describeWorkflow = (name: string, fn: () => void) => describe(`workflow:${name}`, fn);
