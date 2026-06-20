---
name: engineering-insights
description: Use when starting or finishing any devdigest session. Read the relevant module's INSIGHTS.md before touching code; write new non-obvious findings at session end only if substantial and not already recorded.
---

# Engineering Insights

Two mandatory checkpoints every session: **read first, write last.**

## Session Lifecycle

### Step 1 — READ (before any code or analysis)

As soon as you know which module(s) the session touches, read that module's `INSIGHTS.md`. Treat every entry as high-confidence guidance for this session.

If multiple modules are involved, read all of them.

**Do not skip this step** even if the session seems simple — known gotchas live here, not in code.

### Step 2 — WORK

As you go, note things that took multiple attempts, surprised you, or would cost the next agent time to re-discover.

**Capture as you go:** If something truly non-obvious surfaces mid-session — an unexpected constraint, a gotcha, a hard-won fix — write the entry to `INSIGHTS.md` immediately. Don't rely on remembering it at session end.

### Step 3 — DEDUP CHECK (before writing anything)

Before writing a new entry, re-read `INSIGHTS.md`. If the insight is already present in any form, do not write it.

### Step 4 — WRITE (session end, conditional)

Write new entries **only if**:
- Something substantial was discovered (not obvious from reading the code)
- It is not already in `INSIGHTS.md`
- It passes the quality standard below

**Skip Step 4 entirely** for sessions that were purely mechanical — trivial config edits, formatting, no unexpected findings. The signal is "would a future agent benefit?" not "did I spend time?". Sessions under ~30 min with no surprises rarely warrant an entry.

---

## Which File

| Module | File |
|---|---|
| `client/` | `client/INSIGHTS.md` |
| `server/` | `server/INSIGHTS.md` |
| `reviewer-core/` | `reviewer-core/INSIGHTS.md` |
| `e2e/` | `e2e/INSIGHTS.md` |

If work touches multiple modules, write to each relevant one.

---

## Sections

| Section | What goes here |
|---|---|
| **What Works** | Approaches and solutions that worked |
| **What Doesn't Work** | Dead ends, antipatterns — often the most valuable section |
| **Codebase Patterns** | Conventions, architectural decisions |
| **Tool & Library Notes** | Dependency quirks specific to this codebase |
| **Decisions** | Architectural or approach choices made, with the reason — so future agents don't re-open closed questions |
| **Recurring Errors & Fixes** | Common errors and their exact fixes |
| **Session Notes** | Dated summary of what was accomplished |
| **Open Questions** | Unresolved items needing investigation |

---

## Entry Format

```markdown
- YYYY-MM-DD: [Specific, actionable finding — the symptom, constraint, or fix in one sentence] (`path/to/file:line`)
```

Include `file:line` whenever the finding is anchored to specific code — it makes the entry verifiable and jump-to-able without re-investigation. Omit only for pure process/tool observations with no code anchor.

Add under the matching `## Section` header. If the section is missing, append it at the bottom.

---

## Quality Standard

Entries must be cold-readable — a future agent reads it and knows exactly what to do without re-investigating.

| ❌ Noise | ✅ Signal |
|---|---|
| "Promises can be tricky" | "`Promise.all()` times out after 30 items — use `Promise.allSettled()` with batches of 10" |
| "Be careful with async" | "`pnpm db:migrate` must run manually after every schema change — not auto on boot" |
| "Zod is complex" | "Fastify routes use `fastify-type-provider-zod` — never call `Schema.parse()` manually in handlers" |

**Test:** "Would this be obvious to anyone reading the code?" If yes, skip it.

> **INSIGHTS.md is a draft under review.** Entries are LLM-generated; a human spot-check after each wrap-up is expected.

---

## Rules

- **Append-only (agent sessions)** — during a work session, only add entries; never edit or remove existing ones. This prevents merge conflicts and accidental loss of lessons. A human maintenance review (monthly) can delete stale or incorrect entries.
- **Module-specific** — always write to the module where the work happened
- **One entry per insight** — don't bundle unrelated discoveries
- **No forced entries** — an empty session is better than a noisy file
- **Flag conflicts** — if you notice two existing entries that contradict each other, add a note in **Open Questions** flagging the conflict for human resolution; don't silently proceed
- **Size limit** — if a file approaches ~200 entries, add a note in **Open Questions** flagging it for a domain split (e.g., `INSIGHTS-Database.md`, `INSIGHTS-Auth.md`); signal-to-noise degrades past this point
