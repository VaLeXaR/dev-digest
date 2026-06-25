# Gate — checks, severity, state, escape hatch

The logic that turns findings into a PASS/BLOCKED verdict. Read with [SKILL.md](SKILL.md)
(procedure) and [routing.md](routing.md) (scope + skill map).

## 1. Deterministic gates (run before any LLM pass)

Cheapest, highest-signal, no tokens. Run **per package that has changed files**, in this
order. The first non-zero exit → **BLOCKED**, skip the rest.

| Order | Gate       | Command                              | Condition                                        |
|-------|------------|--------------------------------------|--------------------------------------------------|
| 1     | Typecheck  | `npm run typecheck`                  | always                                           |
| 2     | Tests      | `npm run test`                       | always                                           |
| 3     | Lint       | `npm run lint`                       | only if the package defines a `lint` script      |
| 4     | Arch graph | `npm run depcruise` (server/ only)   | only if `server/.dependency-cruiser.cjs` exists  |

Notes for this repo (verify before relying on — scripts change):

- No package defines `lint` today → step 3 skipped automatically.
- `depcruise` not yet wired (`server/.dependency-cruiser.cjs` absent) → step 4 skipped. Once
  the `onion-architecture-node` skill ships the config, this gate enforces the inward-only
  dependency rule for free and a `error`-level edge becomes a hard fail.
- `reviewer-core` tests use `--passWithNoTests`; an empty suite is not a failure.

## 2. Severity scale

| Level        | Means                                           | Effect                          |
|--------------|-------------------------------------------------|---------------------------------|
| **CRITICAL** | Bug, broken contract, or architecture violation | Blocks (after verification)     |
| **HIGH**     | Perf / scaling / maintainability risk           | Warn only                       |
| **MEDIUM**   | DX / style concern                              | Warn only                       |

### Mapping source skills onto this scale

- `react-best-practices`: its CRITICAL → CRITICAL; HIGH → HIGH; MEDIUM → MEDIUM.
- `security`: HIGH-confidence finding → CRITICAL; MEDIUM-confidence → HIGH; LOW → drop (the
  skill instructs not to report LOW).
- `onion-architecture-node` / dependency-cruiser: `error`-level rule → CRITICAL; `warn` → HIGH.

## 3. Closed CRITICAL catalog — only these block

The gate is predictable on purpose: a finding blocks **only** if it matches this list.
Anything else is at most HIGH, regardless of how a skill labels it.

### Deterministic (Step 2 of the procedure)

- Type error (`npm run typecheck` non-zero exit).
- Failing test (`npm run test` non-zero exit).
- Dependency-cruiser `error` rule triggered (once wired).

### Secrets (Step 3a)

- Credential pattern matched on a `+` diff line. No adversarial check needed — the pattern
  itself is the verification.

### Contracts (Step 3c)

- `@devdigest/shared` contract file differs between client and server vendored copies for any
  file the diff touches.

### Backend

- Onion dependency-rule violation: a service importing a concrete adapter; a route reaching
  into `src/adapters/`; a `reviewer-core` file importing anything with I/O (this package is
  pure logic — no DB, no filesystem, no GitHub).
- Unvalidated external input crossing a trust boundary: route body/query/params used without
  a Zod `.parse()` / `.safeParse()` on a new or modified route; auth check missing or
  fail-open on a new endpoint.

### Frontend

- Derive-don't-store: a `useState` holding a value that could be computed from existing state
  or props (should be `useMemo` or derived inline).
- Impure component: fetch, DOM mutation, timer, or subscription directly in render body
  (outside a `useEffect`).
- Hook rules violation: hook call inside a condition or loop; dependency array that provably
  causes a stale closure or infinite re-render loop.

## 4. Adversarial verification (mandatory before any CRITICAL blocks)

Before any CRITICAL can block a merge, run **one skeptic pass**:

> "Try to refute this finding. Is the input really attacker-controlled? Is this finding on a
> changed line or on pre-existing code? Does this actually violate the rule in context?
> **Default to refuted if uncertain.**"

- **Survives** → reported as CRITICAL, blocks the merge.
- **Refuted** → downgraded to HIGH, reported as "downgraded from CRITICAL — [reason]". Never
  dropped silently — the human should still see it.

One false-positive block trains the team to use `--no-verify` permanently. This step is
non-negotiable.

## 5. Suppression (acknowledged findings)

A finding is dropped if the **same line** carries:

```ts
// pr-self-review-ignore: <reason>
```

The `<reason>` is required (reject bare `// pr-self-review-ignore` with no text). The report
always echoes the suppressed count ("N findings suppressed") — suppressions are auditable,
never invisible.

## 6. State file — `.pr-self-review.json` (repo root, git-ignored)

Written at the end of every run; read by `scripts/check-gate.sh` in this skill directory.

```jsonc
{
  "verdict": "PASS",                    // "PASS" | "BLOCKED"
  "diffHash": "<diff-hash.sh output>",  // invalidated by any later working-tree change
  "base": "origin/main",
  "headSha": "<git rev-parse HEAD>",
  "criticalCount": 0,
  "highCount": 2,
  "mediumCount": 1,
  "suppressedCount": 0,
  "ranAt": "2026-06-21T12:00:00Z",
  "findings": [
    { "file": "", "line": 0, "severity": "", "skill": "", "issue": "", "fix": "" }
  ]
}
```

The `diffHash` must come from `scripts/diff-hash.sh` — the same script the hook uses. A
commit, stage, or working-tree edit after a PASS produces a different hash and the hook denies
the push.

`.pr-self-review.json` must be in `.gitignore` — this is per-developer local state.

## 7. Escape hatch (documented, audited)

Every blocking gate needs a way out or the team deletes it:

- **`PR_SELF_REVIEW_OVERRIDE="reason"`** — the hook allows the command and logs the reason to
  stderr. The reason is required; the hook rejects an empty string. Use for genuine hotfixes;
  put the reason in the PR description.
- **`git push --no-verify`** — bypasses git's own pre-push hook. The Claude `PreToolUse` hook
  still runs; use the env var for that path.

Use these sparingly. The goal is to fix the finding, not to route around it.
