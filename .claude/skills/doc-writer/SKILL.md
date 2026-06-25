---
name: doc-writer
description: "Documents existing functionality, converts implementation plans to architecture docs with Mermaid diagrams, or transforms arbitrary input (specs, notes) into structured documentation. Knows where to place docs in the DevDigest monorepo."
metadata:
  type: process
---

# Doc Writer

You produce documentation for DevDigest. Three input modes:

1. **Existing code** → describe what it does, produce diagrams
2. **Implementation plan** → extract architecture decisions, flows, and data models into formal docs
3. **Arbitrary input** (spec, design sketch, meeting notes) → structured docs with diagrams

## Before writing anything

1. Invoke the `mermaid-diagram` skill. Follow it exactly — Mermaid is parser-sensitive and the skill has working, verified examples. Do not write any diagram without reading that skill first.
2. Complete the context-gathering pass below.

## Where to write docs (DevDigest placement rules)

| Doc type | Location |
| --- | --- |
| Cross-cutting architecture decision (ADR) | `docs/adr/YYYY-MM-DD-<decision>.md` |
| Agent prompt for the review engine | `docs/agent-prompts/<name>.md` — update `docs/agent-prompts/README.md` too |
| Implementation plan | `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` |
| Server module doc | `server/docs/<module-name>.md` |
| Client feature doc | `client/docs/<feature-name>.md` |
| General architecture / flow doc | `docs/<topic>.md` |

When in doubt: cross-cutting concern → `docs/`. Single-package internals → `<package>/docs/`.

## Context-gathering pass (always first)

Before writing, gather context in topological order (dependencies first):

1. Read the source files or plan being documented
2. Read any existing docs for the same module (`<package>/docs/` or `docs/`)
3. Read the module's `INSIGHTS.md` — use these paths: `server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`. Do not invent subpaths.
4. Read the package's `CLAUDE.md` for stack context

Do not skip this pass. Docs that contradict existing decisions or miss key gotchas are worse than no docs.

## Writing pass

### Mode 1: Existing code → description

Use this structure:

```markdown
# Module Name

**Purpose:** one sentence.

## What it does

[2–3 paragraphs of prose describing the main flow. Describe behavior, not code structure.]

## Architecture / flow

[Mermaid diagram — sequence diagram if the flow is time-ordered; flowchart if structural]

## Key decisions

[Bulleted list of non-obvious decisions. Each references the INSIGHTS.md entry that explains why.]

## Gotchas

[Bulleted list of traps and invariants a future developer needs to know. Source from INSIGHTS.md and code review notes.]
```

### Mode 2: Implementation plan → architecture doc

Extract four things from the plan:

**2a. Decision rationale** — for each non-obvious choice in the plan ("why X not Y"), write one ADR.

ADR format (MADR v4.0):

```markdown
# [Short title: imperative verb + noun]

Date: YYYY-MM-DD

## Status

Accepted

## Context

[What problem prompted this decision? What constraints existed?]

## Decision

[What was decided, in one sentence.]

## Rationale

[Why this over the alternatives considered?]

## Consequences

[What changes, what becomes easier, what becomes harder.]
```

**2b. Main flow** → Mermaid `sequenceDiagram` of the happy path.

**2c. Data models** → Mermaid `erDiagram` for any new tables or schemas.

**2d. Module structure** → fenced code block with the folder tree + one-line description per file.

### Mode 3: Arbitrary input → structured docs

Ask: what is the reader trying to DO with this doc?

- "Understand how the system works" → flow diagram + prose
- "Make a decision about X" → ADR format
- "Set up or run something" → numbered steps with exact shell commands
- "Reference an API" → table of routes / params / responses

Choose the format for the reader's goal, not the input's shape.

## Mermaid diagram rules

Follow the `mermaid-diagram` skill exactly. The rules that cause the most failures:

- First line must be the exact diagram type: `sequenceDiagram`, `erDiagram`, `flowchart LR`, etc.
- No curly braces `{}` in node text — they break the Mermaid parser
- For sequence diagrams: declare `participant` lines first, then interactions (`A->>B: message`), then notes (`Note over A: text`)
- For ER diagrams: `ENTITY ||--o{ OTHER_ENTITY : "relation label"` — space before the colon
- Output only the fenced mermaid block; no explanatory prose around it when delivering a standalone diagram

## Verification pass (always last)

After writing, verify truthfulness. For every method name, type name, file path, or constant you mention in the docs:

1. Search the codebase for it.
2. If it does not exist in the current codebase → remove it from the docs or mark it with a callout:

   `> ⚠️ Verify: this name was not found in the codebase at time of writing.`

Hallucinated API names in documentation cause more damage than no documentation.

## What this skill is NOT

- Not a code generator — produce docs only
- Not a test writer → use the `test-writer` agent for tests
- Not a requirements spec — describe what IS, not what SHOULD BE (unless writing an ADR for a future decision)
- Not a plan writer → use `superpowers:writing-plans` for implementation plans
