import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 5 Claude sessions total.
 *   - 3 × trace     → 1 session each                      = 3
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Pure dispatch check. KNOWN-FLAKY and the reason this whole tier is non-blocking: even a
    // capable model (haiku) may answer in one turn without invoking the Task/Agent tool, so
    // `subagents` comes back empty. Treat a red here as indicative, not a regression — the README
    // says the same. Kept because dispatch IS a behavior worth watching, not because it's reliable.
    name: "dispatches the architecture-reviewer subagent for a plan review",
    prompt:
      "Use the architecture-reviewer subagent to audit this plan against the repo's onion-layer " +
      "contracts: 'Add a new GET /reviews/:id/export endpoint that returns a review as markdown.' " +
      "Invoke that subagent to do the assessment — do not audit it yourself.",
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): two "Read When" rows at once -----------------------------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Read When" routing, so the prompt must push toward CONSULTING the docs,
    // not exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc. One anchor doc (pipeline.md)
    // keeps this a deterministic routing check — asserting two docs in one session is inherently flaky.
    name: "pipeline task follows CLAUDE.md routing to reviewer-core/README",
    prompt:
      "I'm about to change the review pipeline, which lives in the reviewer-core package. Before " +
      "touching code, consult that package's own guidance (its CLAUDE.md) on which docs to read for " +
      "pipeline work, and read exactly those docs.",
    expectFilesRead: ["reviewer-core/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Hit unexpected behavior" routing -> gotchas ----------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path and read gotchas.md, making the negative flaky. As a single-session trace it
  // reliably checks the same routing rule: in the real repo, the discovery prompt reads gotchas.md.
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/INSIGHTS.md",
    prompt:
      "In reviewer-core I hit unexpected behavior — something works differently than I expected. " +
      "Per this repo's guidance, where might this already be documented? Read that file.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "I just figured out why the pgvector query returned zero rows — the column dimension didn't " +
      "match after switching embedding models. I want to record this so I don't hit it again.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Explain how column dimensions work in pgvector and why a mismatch returns zero rows.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
