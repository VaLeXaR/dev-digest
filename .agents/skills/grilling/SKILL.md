---
name: grilling
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a question can be answered by exploring the codebase, explore the codebase instead — dispatch a `researcher` subagent via `Agent` rather than reading files directly yourself, and when several independent questions need codebase evidence, dispatch several `researcher` subagents in parallel rather than one after another. Ask each researcher for `output: compact-digest` (per `.claude/agents/README.md` Pattern 1) rather than an ad hoc word limit, so the digest stays a consistent, auditable contract across dispatches.

Exception: a single-fact, single-tool-call check (e.g. "does this package.json list dependency X", "does this one file already contain pattern Y") may be answered with one direct `Grep`/`Read`/`Bash` call instead of a subagent dispatch — the dispatch overhead isn't worth it for a lookup with an unambiguous yes/no answer. Anything needing more than one file, more than one tool call, or judgment about what's relevant still goes to `researcher`.
