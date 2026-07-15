import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose violations map onto DevDigest-SPECIFIC rule names
// (`reviewer-core-zero-io`, `reviewer-core-ground-findings-gate`) that a competent model will
// describe in prose but will not spontaneously name unless the agent forces a citation. This is
// the discriminating case for the strict-vs-lite A/B: both variants should FIND both problems,
// but only the strict variant (which keeps the "cite the exact documented rule per finding" hard
// rule) should reliably emit the identifier. The checkout diff's textbook violations don't
// discriminate — the model volunteers `inward-only-dependencies`/`di-discipline` either way.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "cites the specific documented rule" keeps passing.
// Rule identifiers below are the agent's OWN documented slugs (see the rules table in
// .claude/agents/architecture-reviewer.md — `inward-only-imports`, `no-http-in-services`,
// `di-discipline`, `reviewer-core-zero-io`, `reviewer-core-ground-findings`). Practices must cite
// those exact slugs, never invented variants, or a correct agent is failed for wording alone.
// Thresholds are < 1.0 on purpose: an LLM judge has ~5-10% per-practice noise, so demanding 100%
// of practices reds a correct run. Allow one miss on the multi-practice cases (0.8); the benign
// negative case sits at 0.67 (2 of 3). Pair with a stronger cross-family judge (EVAL_JUDGE_MODEL).
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      // FastifyReply (an HTTP/Presentation type) reaching the Domain file is legitimately either
      // `no-http-in-services` OR `inward-only-imports` under the agent's rules — accept both.
      "flags the domain file (checkout.ts) importing `FastifyReply` from 'fastify' as a layering violation — a Presentation/HTTP type leaking into the Domain layer (rule `no-http-in-services` or `inward-only-imports`)",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      "names a documented rule identifier for EVERY finding (e.g. `inward-only-imports`, `no-http-in-services`, `di-discipline`) rather than describing the problem only in prose",
      "assigns a severity (critical/high/medium/low/info) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit PASS/FAIL gate verdict based on whether any critical or high findings exist",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      // The FastifyReply param IS part of the same HTTP-in-domain layering violation — citing it
      // (on both the import and the param) is thorough, not fabrication. What we guard against is
      // dressing the `reply?` param up as a SECURITY or runtime bug (the "security-shaped" trap).
      "does not raise a SECURITY or runtime-bug finding about the `reply?: FastifyReply` parameter (e.g. response tampering / data leak) — the only issue is the layering / HTTP-in-domain violation, which it may legitimately cite on both the import and the parameter",
      "keeps findings scoped to structural/layering/DI contracts — does not raise separate naming, code-style, or test-coverage findings",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "names the exact documented rule identifier `reviewer-core-zero-io` for the fs-import finding rather than only describing it in prose",
      "names the exact documented rule identifier `reviewer-core-ground-findings` for the skipped-gate finding rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit PASS/FAIL gate verdict based on whether any critical or high findings exist",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only `info`-level, non-blocking observations) — it does not invent a critical/high/medium finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final gate verdict is PASS",
    ],
    threshold: 0.67,
    maxTurns: 25,
  },
];
