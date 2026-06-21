---
name: pr-self-review
description: "Use before git push, gh pr create, or gh pr merge — and on demand via /pr-self-review. Runs cheap deterministic checks first, then routes changed files through domain skills per bucket, adversarially verifies every CRITICAL, and blocks if any survive. Also use when the user asks to self-review or check local changes before opening a PR."
user-invocable: true
version: "1.0.0"
---

# PR Self-Review — local pre-PR gate

Catch problems **before** a pull request exists. This skill is the orchestrator: it contains
no review knowledge of its own — it runs cheap automated checks, routes changed files to the
project's existing domain skills, and turns their findings into a **merge gate**.

- **What blocks:** one or more *verified* CRITICAL findings — see [gate.md](gate.md).
- **What never blocks:** HIGH / MEDIUM (warnings), pre-existing code on untouched lines,
  test files (style-level only), generated/vendored code.

Companion files: **[routing.md](routing.md)** (diff scope + file→skill map),
**[gate.md](gate.md)** (deterministic checks, CRITICAL catalog, state file, escape hatch).

## Two modes

1. **Automatic** — `scripts/check-gate.sh` in this skill directory (wired as a `PreToolUse`
   hook in `.claude/settings.json`) intercepts `git push` / `gh pr create` / `gh pr merge`
   and
   **denies** the command unless a fresh PASS is on record for the *current* diff. The hook
   does **not** run the review — it only enforces that one ran and passed.

2. **Manual** — `/pr-self-review`, or when the user asks to "self-review" / "check my
   changes before the PR". This is the path that actually performs the review and writes the
   state file the hook reads.

## Procedure

Run steps in order. Stop early on any deterministic failure — don't spend tokens reviewing
architecture on a tree that doesn't typecheck.

### Step 1 — Scope the diff

Per [routing.md §1](routing.md):

- `BASE = git merge-base origin/main HEAD`
- Collect all open changes vs main: committed-not-merged + staged + unstaged + untracked.
- Scope findings to **added/modified lines only** (hunk ranges from `git diff "$BASE"`).
  Never flag pre-existing problems on lines the diff doesn't touch — even inside a changed
  file. A one-line fix must not surface issues in the other 499 unchanged lines.
- Drop always-skip paths: `vendor/shared/`, `db/migrations/`, lockfiles, `node_modules/`,
  `dist/`, `.next/`, pure docs.
- If no reviewable changes remain → write PASS state and stop.

### Step 2 — Deterministic gates (fail-fast)

Per [gate.md §1](gate.md). For each package that has changed files, run the scripts that
exist in this order. Any non-zero exit → **BLOCKED immediately**, skip remaining steps.

```
npm run typecheck   — client/, server/, reviewer-core/
npm run test        — client/, server/, reviewer-core/
npm run lint        — only if the package defines a lint script (none do today)
npm run depcruise   — server/ only, only if server/.dependency-cruiser.cjs exists (not yet)
```

These are cheapest, highest-signal — they run first by design.

### Step 3 — Extra deterministic checks (no tokens)

Run as regex/git ops before any LLM pass.

**a. Secrets scan** — match only `+` lines in the diff:

| Pattern type | Examples |
|---|---|
| Key prefixes | `sk-`, `ghp_`, `ghs_`, `AKIA`, `xoxb-`, `xoxp-` |
| Assignment | `password\s*=\s*["'][^"']{6,}`, `token\s*=\s*["'][^"']{6,}`, `api_key\s*=\s*["'][^"']{6,}` |
| PEM headers | `BEGIN RSA PRIVATE KEY`, `BEGIN EC PRIVATE KEY`, `BEGIN OPENSSH PRIVATE KEY` |

Any hit → **CRITICAL** immediately. No adversarial verification needed — the pattern is
deterministic.

**b. Schema without migration** — if any file under `server/src/db/schema/` changed but no
new file appears in `server/src/db/migrations/` → **INFO**: "Schema changed — generate a
migration and run `cd server && pnpm db:migrate`."

**c. Contract drift** — per [routing.md §4](routing.md): for each contract file touched in
the diff, compare the client and server vendored copies. Any difference → **CRITICAL**.

### Step 4 — Route + review (LLM passes, fanned out)

Per [routing.md §2–§3](routing.md), split changed files into buckets and spawn **one
analyzer subagent per bucket in parallel** (Agent tool). Give each subagent only its file
slice and the skills for that bucket. Require structured output: `{file, line, severity,
skill, issue, fix}` — no prose summaries, no re-stating what the code does.

Before handing files to each subagent, include the touched package's `INSIGHTS.md` as
extra review criteria. These contain project-specific gotchas that domain skills don't know.

For small diffs (≤ 3 files, single bucket) skip the fan-out and review inline.

### Step 5 — Normalize, adversarially verify, gate

Per [gate.md §2–§5](gate.md):

1. Collapse all findings to the shared severity scale (CRITICAL / HIGH / MEDIUM).
2. Drop findings matching a `// pr-self-review-ignore: <reason>` suppression on the same
   line. Echo suppressed count in the report — never silent.
3. **Adversarially verify every CRITICAL** before it can block: "Try to refute this finding.
   Is the input really attacker-controlled? Is this on a changed line (not pre-existing)? Does
   this really violate the rule? Default to **refuted** if uncertain." Survives → blocks.
   Refuted → downgraded to HIGH with a note ("downgraded from CRITICAL — [reason]"). Never
   dropped silently.
4. Gate: `verifiedCriticals ≥ 1` → **BLOCKED**, else → **PASS**.

### Step 6 — Record + report

- Write `.pr-self-review.json` at repo root (verdict, diffHash from `scripts/diff-hash.sh`
  in this skill directory,
  base, headSha, counts, findings array). See [gate.md §6](gate.md) for the schema.
- Print a summary grouped by severity, ending with `✅ PASS` or `🚫 BLOCKED — N critical`.
- On BLOCKED: list each critical with `file:line` and the fix. Remind that
  `PR_SELF_REVIEW_OVERRIDE="reason"` is the documented escape hatch.

### Step 7 — Offer PR description (PASS only)

Offer to generate:
- PR title (≤ 70 chars, conventional commits style)
- PR body (Summary bullets + Test plan checklist)

Based on the diff summary and warnings/infos as context. User can accept or skip.

## Output contract

`.pr-self-review.json` at repo root (git-ignored, per-developer local state) is the source
of truth the hook enforces. The chat summary is for the human.
