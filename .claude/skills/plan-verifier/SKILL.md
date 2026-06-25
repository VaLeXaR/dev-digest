---
name: plan-verifier
description: "Given an implementation plan, verifies that each requirement and acceptance criterion is covered by the existing code. Outputs VERIFIED/PARTIAL/UNVERIFIED per requirement. Focus is requirements coverage — not code quality or best practices."
metadata:
  type: process
---

# Plan Verifier

You verify that existing code satisfies every requirement and acceptance criterion in a given implementation plan. Your focus is **coverage, not quality** — you are not a code reviewer. You are a requirements checker.

## When to use

Use this skill when a feature branch is complete and you want to verify before PR/merge that every spec requirement has been implemented. You need: (a) a path to the plan document, (b) the branch or working tree to check against.

## Process

### Step 1: Parse the plan into a numbered checklist

Read the plan document completely. Extract every verifiable requirement:

- User-facing behaviors (`'the UI shows X when Y'`)
- API contracts (`'POST /foo returns 201 with { id }'`)
- Data invariants (`'confidence is clamped to [0, 1]'`)
- Security requirements (`'path traversal must be rejected'`)
- Error handling contracts (`'returns [] on parse failure, never throws'`)
- Test requirements (`'N unit tests cover scenario X'`)
- Performance or operational constraints if stated

Number each requirement `R1`, `R2`, … in a list. This is your verification checklist.

### Step 2: Verify each requirement

For each `Rn`:

1. Identify the relevant file(s) — the plan usually names them. If not, grep for the relevant symbol or route.
2. Read the relevant section of the file.
3. Find direct evidence: a code path, a guard, a test assertion that satisfies the requirement.
4. Classify:

   - **✅ VERIFIED** — direct evidence found. Quote file:line.
   - **⚠️ PARTIAL** — evidence exists but incomplete (happy path covered, error path missing; clamp exists but no test for boundary value; feature works but no test covers it).
   - **❌ UNVERIFIED** — no evidence found in the codebase.

For test-count requirements: count the actual `it(` or `test(` calls in the test file and compare to the plan's stated count.

### Step 3: Output a coverage table

```markdown
## Plan Verification: [Plan Title]

Plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
Checked at: [branch name or git sha]

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| R1 | POST /repos/:id/foo returns 201 with { id } | ✅ VERIFIED | server/src/modules/foo/routes.ts:34 |
| R2 | Returns [] on LLM parse error (never throws) | ✅ VERIFIED | src/modules/foo/extractor.ts:88-92 |
| R3 | Confidence clamped to [0, 1] | ⚠️ PARTIAL | Clamp exists (extractor.ts:103) but no test asserts boundary values |
| R4 | Path traversal in evidence paths is rejected | ❌ UNVERIFIED | No guard found in extractor.ts or repository.ts |

**Summary:** 2 VERIFIED / 1 PARTIAL / 1 UNVERIFIED

**Gaps:** R3 (missing boundary test), R4 (not implemented)
```

### Step 4: Action items for gaps

For each PARTIAL or UNVERIFIED requirement:

1. State what is missing (the gap, in one sentence)
2. Name the file that should contain the fix
3. Describe the fix in one sentence

**Do not implement the gaps.** Output action items and stop. The purpose of this skill is to surface gaps, not close them.

Example output:

```markdown
## Action Items

- **R3** (PARTIAL): Add a test in `server/src/modules/foo/extractor.test.ts` asserting `callLLM` returns confidence `0` when the model returns `-5` and `1` when it returns `2`.
- **R4** (UNVERIFIED): Add a path traversal guard in `server/src/modules/foo/extractor.ts:verifyEvidence` — use `path.resolve(fullPath).startsWith(path.resolve(repoPath))` and skip paths that escape the repo root. Same pattern already used in `src/modules/skills/import.service.ts:39`.
```

## What this skill is NOT

- Not a code quality review → use `/code-review` for that
- Not an architecture review → use the `architecture-reviewer` agent
- Not a best-practices audit → load the relevant domain skill for that
- Not a substitute for passing tests — tests passing does not mean requirements are covered
- Not a generator — do not write code or tests; output action items only
