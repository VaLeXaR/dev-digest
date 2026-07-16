import type { SkillCase } from "../../src/index.js";

// Content-tier cases: skillTask injects SKILL.md as the system prompt and runs with NO tools, so
// every prompt inlines the concrete session/scenario the skill must reason over and asks for a
// direct answer (never "let me read the file"). Practices are worded against the skill's OWN
// vocabulary — the read-first/write-last lifecycle, the Non-Destructive Write Contract, the
// write-decision gate, the signal-vs-noise Quality Standard, and the dated `file:line` entry
// format — never invented terminology. Case 4 additionally uses a `grounding` gate: its
// expectation is a pair of concrete facts (the target module file + the section name), so the
// cheap deterministic substring tier settles them before the judge is paid.

export const cases: SkillCase[] = [
  {
    // Highest-value regression target: a reworded description or trimmed section could silently
    // drop the Write→destroys-file rule, and nothing else in the harness re-teaches it.
    name: "adds a new entry to an existing INSIGHTS.md via anchored Edit, never Write",
    kind: "quality",
    prompt:
      "I just finished a server/ session and captured one new gotcha worth recording. " +
      "`server/INSIGHTS.md` already exists and holds ~40 prior entries across several `##` " +
      "sections. Walk me through exactly how to add my new entry to that file: which tool or " +
      "operation to use, which to avoid, what to check right before you write, and — if my new " +
      "finding turns out to contradict an older entry already in the file — how to reconcile the " +
      "two. Answer directly — do not ask for tool access.",
    practices: [
      "says NEVER use the `Write` tool on an existing INSIGHTS.md, because Write replaces/overwrites the whole file and destroys all prior entries",
      "says to add the entry with an anchored `Edit` that inserts the new bullet under the correct existing `##` section heading",
      "says to re-read the target INSIGHTS.md immediately before writing, because its contents may have changed during the session",
      "says corrections are additive — a new dated note supersedes a contradicted old entry, and the old entry is never deleted or edited in an agent session",
    ],
    threshold: 0.75,
    maxTurns: 6,
  },
  {
    // The write-decision gate (Step 4): a mechanical, no-surprise session must NOT produce an
    // entry. Guards against the skill drifting toward "always write something".
    name: "skips writing an entry for a purely mechanical, no-surprise session",
    kind: "quality",
    prompt:
      "Session recap: I spent about 20 minutes renaming the CSS token `--sidebar-bg` to " +
      "`--surface-2` across `client/` and reran Prettier. Everything compiled on the first try, " +
      "nothing surprised me, and nothing took more than one attempt. Per the insights workflow, " +
      "should I write a `client/INSIGHTS.md` entry for this session? Decide yes or no and justify.",
    practices: [
      "concludes NO — no INSIGHTS.md entry should be written for this session",
      "justifies the skip because the session was purely mechanical / trivial with no surprises and nothing that took multiple attempts",
      "invokes the principle that an empty session is better than a noisy file (no forced entries), rather than inventing a low-value entry just to have one",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    // The signal-vs-noise Quality Standard, including the subtle rule that a pure process/tooling
    // constraint is legitimately kept WITHOUT a file:line anchor.
    name: "rejects noise entries and keeps only cold-readable, actionable signal",
    kind: "quality",
    prompt:
      "Here are three candidate INSIGHTS.md entries a teammate drafted. For each, tell me whether " +
      "to keep it as-is, rewrite it, or drop it, why, and — for any you keep — whether it needs a " +
      "`file:line` anchor:\n" +
      'A) "- Promises can be tricky, be careful with async."\n' +
      'B) "- The reviews route is defined in server/src/modules/reviews/routes.ts."\n' +
      'C) "- `pnpm db:migrate` must be run manually after every schema change — it is not run on ' +
      'boot."\n' +
      "Answer directly.",
    practices: [
      "drops entry A as noise — it is vague and not cold-readable, giving a future agent nothing actionable",
      "drops or downgrades entry B because it is obvious from reading the code — it fails the 'would this be obvious to anyone reading the code?' test",
      "keeps entry C as genuine signal — a specific, actionable constraint a future agent could not derive from the code alone",
      "recognizes that entry C is correctly kept even though it has no `file:line` anchor, because it is a pure process/tooling constraint with no single code line to point at",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    // Entry format + section routing + module routing. Expectation includes two concrete facts
    // (target module file + section name), so a cheap `grounding` substring gate runs before the
    // judge — the patternMatch-first tier for concrete facts.
    name: "formats a new reviewer-core finding as a dated, file-anchored bullet under the right section",
    kind: "quality",
    prompt:
      "During work in `reviewer-core/` I hit a dead end: passing the raw PR patch straight into " +
      "the prompt without the INJECTION_GUARD wrapper lets crafted diff text override the review " +
      "instructions — the guard in `reviewer-core/src/prompt.ts` (around line 42) is the only " +
      "defense. Draft the exact INSIGHTS.md entry line I should add, and tell me which module's " +
      "file and which `##` section it belongs under. Answer directly and show the literal line.",
    grounding: ["reviewer-core/INSIGHTS.md", "What Doesn't Work"],
    practices: [
      "routes the entry to `reviewer-core/INSIGHTS.md` — the module where the work happened — not server/ or another module",
      "places it under the `What Doesn't Work` section, since it is a dead end / antipattern",
      "formats the entry as a dated bullet whose finding text is prefixed with a `YYYY-MM-DD:` date",
      "includes a `file:line` code anchor pointing at `reviewer-core/src/prompt.ts`",
      "writes a cold-readable, specific finding (the concrete symptom and constraint), not a vague note",
    ],
    threshold: 0.75,
    maxTurns: 6,
  },
];
