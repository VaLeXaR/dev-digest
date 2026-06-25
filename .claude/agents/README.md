# DevDigest Agents

Specialized subagents that Claude Code dispatches for structured, repeatable workflows.
Each agent is a Markdown file with YAML frontmatter declaring its model, tool access, and
preloaded skills — the body is the system prompt the agent runs under.

## How to dispatch

```bash
# By name (Claude auto-delegates when description matches)
# Add "use proactively" to the description to encourage proactive delegation

# Via @-mention (guaranteed delegation for one task)
@researcher find where GitHub token is read in the server package

# Via --agent flag (session-wide agent)
claude --agent planner "add conventions badge to sidebar"
```

Agents with a `name:` in frontmatter are auto-dispatched by the harness when their
`description:` matches the task. The description field is truncated at 1,536 characters
in the skill listing — keep descriptions precise.

### Skills: eager vs lazy loading

Skills listed in an agent's `skills:` frontmatter are **fully injected at startup** (eager).
Skills NOT listed are still accessible via the `Skill` tool during execution (lazy — body loads
on invocation, stays for the session, re-attached after compaction up to 5,000 tokens each
with a 25,000-token combined budget). Design accordingly: preload only skills the agent always
needs; invoke domain-specific skills lazily.

### Worktree isolation (optional)

Adding `isolation: worktree` to an agent's frontmatter runs it in an isolated git worktree
branched from the **repository's default branch**. This prevents disk-level file conflicts
between parallel agents but does not prevent logical conflicts. Use with caution on feature
branches — the worktree starts from `main`, not from your current branch. For feature-branch
parallel work, use the Owned paths pattern instead (or the `superpowers:using-git-worktrees`
skill for manual worktree setup from the current branch).

---

## Agents

### Doc Writer — [`doc-writer.md`](doc-writer.md)

**Purpose:** Produces documentation for DevDigest in three modes: (1) existing code → prose
description + diagrams, (2) implementation plan → formal architecture doc with ADRs +
flow/data-model diagrams, (3) arbitrary input → structured docs matched to the reader's goal.
Classifies every page by Diátaxis quadrant (tutorial/how-to/reference/explanation). Writes
documentation files only; never modifies product code.

**Model:** `sonnet` | **Tools:** `Read, Glob, Grep, Bash, Write, Edit, Skill`

**Skills preloaded (eager):** `mermaid-diagram` (diagrams), `typescript-expert` (reading source types),
`onion-architecture-node` (backend structure), `react-frontend-architecture` (client structure),
`engineering-insights` (INSIGHTS.md context) — all five loaded at startup because every doc-writer
run may need any of them.

**When to use:**
- Documenting a newly implemented module or feature
- Converting a Development Plan into formal architecture docs (ADRs + module docs)
- Turning meeting notes, design sketches, or specs into structured Markdown

**Design principles:**

- **Diátaxis quadrant first** — classifies every page as tutorial, how-to, reference, or
  explanation before writing. Never mixes types on one page; AI leads on reference/how-to,
  defers rationale to humans on explanation.
- **Ground every claim** — documents only what is observable in source code, comments, or
  existing ADRs. Never invents APIs, parameter names, or rationale. Unreachable facts are
  flagged as grounding gaps in the output, not filled with plausible prose.
- **Provenance stamp** — places `<!-- generated from: <source files> -->` on the second line
  of every new file so the chain from source to doc is always traceable.
- **Existence verification** — after drafting, greps every named entity (function, type, file)
  to confirm it exists in the current codebase. Entities not found are removed or marked with a
  warning callout; hallucinated API names in docs cause more damage than no documentation.
- **ADRs are append-only** — never edits an accepted ADR; creates a new one that supersedes it.
- **INSIGHTS first** — reads `<module>/INSIGHTS.md` before writing to avoid contradicting
  existing decisions or missing documented gotchas.

**Placement rules (summary):**

| Doc type | Location |
| --- | --- |
| ADR | `docs/adr/YYYY-MM-DD-<decision>.md` |
| Agent prompt | `docs/agent-prompts/<name>.md` |
| Implementation plan | `docs/plans/<name>.md` |
| Server module doc | `server/docs/<module>.md` |
| Client feature doc | `client/docs/<feature>.md` |
| General / cross-cutting | `docs/<topic>.md` |

**Sources:**
- [Diátaxis — Start Here](https://diataxis.fr/start-here/)
- [DocAgent: Automated Code Documentation Generation (arXiv 2504.08725)](https://arxiv.org/html/2504.08725v1)
- [AI can write your docs, but should it? (Mintlify)](https://www.mintlify.com/blog/ai-can-write-your-docs-but-should-it)
- [Architecture Decision Record (Martin Fowler)](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
- [Master ADRs: best practices (AWS)](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/)
- [avoid-ai-writing SKILL.md (conorbronsdon)](https://github.com/conorbronsdon/avoid-ai-writing/blob/main/SKILL.md)
- [developer-docs-framework (anivar)](https://github.com/anivar/developer-docs-framework)
- [Context strategies for automated ADR generation (arXiv 2604.03826)](https://arxiv.org/pdf/2604.03826)

---

### Plan Verifier — [`plan-verifier.md`](plan-verifier.md)

**Purpose:** Verifies that every requirement and acceptance criterion in an implementation plan
is covered by existing code. Parses the plan into a numbered checklist, reads the actual code
for each item, and outputs VERIFIED / PARTIAL / UNVERIFIED / CANNOT-VERIFY per requirement
with a PASS / FAIL / REVIEW gate verdict and concrete action items for gaps. Read-only; never
modifies files.

**Model:** `opus` | **Tools:** `Read, Glob, Grep, Bash, Skill`

**Skills preloaded (eager):** `typescript-expert`, `onion-architecture-node`,
`react-frontend-architecture` (locate backend and frontend artifacts), `zod` (interpret
shared contract changes), `security` (inform the implicit auth/access-control sweep).

**When to use:**
- Before opening a PR to confirm all spec requirements are implemented
- After a multi-agent implementation run to audit coverage gaps
- When a plan has many requirements and manual spot-checking is error-prone

**Design principles:**

- **Step 0 ground truth** — reads INSIGHTS.md and runs `git diff main...HEAD --name-only`
  before touching the plan, so verification is anchored to what actually changed.
- **Evidence before verdict** — every status requires a `file:line` the agent actually read.
  Grep hits alone are not evidence. Re-injects "evidence = a line I read" before each verdict
  to counter instruction attenuation on long checklists (39% performance drop without it).
- **Four-status model** — VERIFIED / PARTIAL / UNVERIFIED / CANNOT-VERIFY. The fourth status
  prevents force-fitting ambiguous or runtime-dependent requirements into a binary verdict.
- **Spec wins, never implementation** — if code and spec disagree, that is PARTIAL or
  UNVERIFIED. Never relaxes a requirement to fit what the code currently does.
- **Pass 2 implicit sweep** — after explicit requirements, checks error paths, auth/access
  control, wiring (`modules/index.ts`, route mounted, migration applied), contract sync,
  CI weakening, new imports, and diff orphans (files in `git diff` mapping to no requirement).
- **"How sought" column** — every row in the output table names the search strategy used,
  making it auditable by a human reviewer.
- **Gate verdict** — summarises as PASS / FAIL / REVIEW with explicit counts and a list of
  blocking gaps, not just a tally.
- **Cross-package contract sync** — for Zod/shared-contract requirements, verifies both
  `server/src/vendor/shared/` and `client/src/vendor/shared/` copies must match.

**Sources:**
- [Spec-Driven Development with AI (ArceApps)](https://arceapps.com/blog/spec-driven-development-ai/)
- [How to write acceptance criteria an AI agent can verify (BrainGrid)](https://www.braingrid.ai/blog/how-to-write-acceptance-criteria-ai-agent-can-verify)
- [Code search for AI agents: which tool, when (ceaksan)](https://ceaksan.com/en/code-search-for-ai-agents-which-tool-when)
- [LLM behavioral failure modes (ceaksan)](https://ceaksan.com/en/llm-behavioral-failure-modes)
- [AI coding agents — what they still miss (dev.to/moonrunnerkc)](https://dev.to/moonrunnerkc/ai-coding-agents-can-verify-some-of-their-work-now-heres-what-they-still-miss-58mc)
- [How to create a traceability matrix (Perforce)](https://www.perforce.com/blog/alm/how-create-traceability-matrix)
- [Why coding agents still use grep (yage.ai)](https://yage.ai/share/why-coding-agents-still-use-grep-en-20260327.html)
- [The Judge Who Never Admits: LLM evaluation biases (arXiv 2602.07996)](https://arxiv.org/pdf/2602.07996)
- [AI code review standards (metacto)](https://www.metacto.com/blogs/establishing-code-review-standards-for-ai-generated-code)
- [Requirement traceability best practices (aqua-cloud)](https://aqua-cloud.io/ai-requirement-traceability/)

---

### Researcher — [`researcher.md`](researcher.md)

**Purpose:** Read-only agent that locates and synthesises information from the project
codebase or the public internet, returning it in a structured, actionable format with
full citations. Never modifies files.

**Model:** `opus` | **Tools:** `Read, Glob, Grep, Bash, WebSearch, WebFetch`

**When to use:**

- Finding where a symbol, feature, or pattern is defined or used in the codebase
- Looking up library docs, API specs, or best practices from the web
- Given a list of specific URLs — extracting every actionable pattern from each
- Fact-checking before architectural decisions
- Delegated discovery from the Planner (keeps Planner context clean)

**Design principles:**

- **Interview first** — stops and asks 1–4 clarifying questions before searching when the
  request has no explicit question, ambiguous scope, or missing parameters. Offers a best-guess
  default for each question so the user can confirm fast.
- **Two internet modes** — *Discovery* (no URLs given: multi-angle search → triage → deep-read
  → follow key links → synthesise); *Extraction* (specific URLs given: fetch ALL of them, read
  each in full, cross-reference, produce synthesis). Never skip a given URL or "pick the most
  promising."
- **Deep-read requirement** — reads entire articles, not just introductions. Extracts named
  rules with their "why" (what failure the rule prevents) and concrete examples.
- **Synthesis as primary output** — the merged, deduplicated patterns section is the main
  deliverable; per-source findings are supporting evidence.
- **Cite everything** — every project finding includes `path:line`; every web finding includes
  a verbatim quote and source URL. No claim without a locator.
- **Quality bar self-check** — before returning, answers: Did I read every URL in full? Can
  the caller take a specific action from my synthesis? Is every claim cited? Did I cross-reference?
- **Honest about gaps** — never invents facts; reports "Not found" explicitly with what was searched.

**Sources:**
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)

---

### Planner — [`planner.md`](planner.md)

**Purpose:** Read-only architect. Turns a feature request into a structured Development Plan
file (`docs/plans/<name>.md`) with phased tasks, owned-path assignments, a dependency DAG,
and measurable acceptance criteria. Never writes product code.

**Model:** `opus` | **Tools:** `Read, Glob, Grep, Bash, Agent, Write`

**Skills preloaded (eager):** all Implementer skills + `mermaid-diagram` — the Planner carries
the full skill set because it must anticipate every constraint an Implementer will apply.

**When to use:**

- Before any non-trivial feature (≥ 3 files or ≥ 2 modules)
- When parallel Implementer agents need coordinated task boundaries
- When you need measurable acceptance criteria before touching code

**Design principles:**

- **Decomposition-first** — produces a complete plan artifact before any implementer starts.
  Plan quality directly determines how long implementers can run unattended without human
  intervention.
- **Self-contained tasks (first-invocation-carries-everything)** — implementer subagents have
  isolated context windows and cannot pause to ask questions mid-run. Every task carries exact
  file paths, contract references, and acceptance criteria. No "see T-01" or "same as above."
- **Concrete task descriptions** — Bad: "Update the auth service." Good: "Add rate-limiting to
  `server/src/modules/auth/routes.ts`: return 429 when user exceeds 10 req/min via injected
  `CacheAdapter`." Abstract descriptions cause file-ownership ambiguity and parallel conflicts.
- **Goldilocks granularity** — too large = wasted parallelism; too small = coordination overhead
  beats the gain. A well-sized task touches one owned-path domain, ≤5 files, one acceptance
  command. If a task spans two independent domains → split. If two tasks always run together → merge.
- **Shorter tasks fail less** — doubling task duration roughly quadruples failure rate. Keep
  tasks atomic; put integration edge-cases (auth, rate limits, error formats) in their own explicit
  tasks rather than hidden inside implementation tasks.
- **Contracts first** — shared types, API shapes, and DB migrations are the earliest tasks.
  Parallel implementers must not invent shared contracts independently. Real failure mode: two
  agents whose local tests both pass, but the merged API silently breaks response-shape validation.
- **Owned paths at file AND directory level** — since implementers run on the same branch without
  automatic worktree isolation, two concurrent tasks must not share a file or parent directory.
  Concurrent tasks touching the same directory risk merge conflicts even without touching the same file.
- **DAG dependency model** — `Depends-on` points only to earlier tasks; no cycles; independent
  tasks marked for concurrent execution.
- **Pre-flight contradiction scan** — Red-flags check scans Requirements and Architecture notes
  for internal contradictions before Task 1 dispatches.
- **Independently mergeable phases** — each phase must produce a self-consistent state; Phase 2
  must not leave the codebase broken until Phase 3 completes.
- **Over-engineering guard** — start with the simplest solution. Prove the core task works first.
  Use a multi-phase DAG only when a linear plan genuinely cannot satisfy the requirements.
- **INSIGHTS first** — reads `<module>/INSIGHTS.md` for every affected module, folds relevant
  gotchas into each task's `Known gotchas` field.
- **Delegation via Agent** — heavy codebase discovery delegated to `researcher` or `Explore`
  subagents, keeping Planner context clean for architecture decisions.

**Sources:**
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Effective harnesses for long-running agents (Anthropic)](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [affaan-m/everything-claude-code · planner.md](https://github.com/affaan-m/everything-claude-code/blob/main/agents/planner.md)
- [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- [Parallel Claude Code Agents (aakashx)](https://www.aakashx.com/blog/parallel-claude-code-agents/)
- [Sub-Agent Best Practices (claude.fast)](https://claudefa.st/blog/guide/agents/sub-agent-best-practices)
- [Agent Teams: Parallel + Shared Task List (MindStudio)](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-shared-task-list)
- [Parallel Agents Coordinate Through Orchestrator (MindStudio)](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-agents)
- [AI Agent Harness Failures: 13 Anti-Patterns (Atlan)](https://atlan.com/know/agent-harness-failures-anti-patterns/)
- [6 Critical Mistakes in Agentic AI Engineering (DecodingAI)](https://www.decodingai.com/p/agentic-ai-engineering-guide-6-mistakes)

---

### Implementer — [`implementer.md`](implementer.md)

**Purpose:** Executes exactly one task from a Development Plan. Follows a TDD red-green-refactor
cycle, runs diff-review before declaring done, and escalates with a structured status code
rather than silently failing or guessing.

**Model:** `sonnet` | **Tools:** `Read, Glob, Grep, Edit, Write, Bash, Skill, Agent`

**Skills preloaded (eager):** `engineering-insights` only — domain skills are loaded lazily
via the `Skill` tool based on task type, keeping startup context lean.

**When to use:**
- After the Planner has produced a Development Plan
- One Implementer per task; tasks with non-overlapping Owned paths can run simultaneously
- Both backend (`server/`, `reviewer-core/`) and UI (`client/`) work

**When NOT to dispatch as a subagent:**
- Workflows requiring visible, step-by-step progress — subagents have no real-time thinking
  transparency; keep those tasks in the main agent.

**Skill sets by task type (loaded lazily via Skill tool):**

| Type | Skills invoked |
| --- | --- |
| **backend** | `onion-architecture-node`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `security`, `typescript-expert` |
| **ui** | `react-frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `zod`, `typescript-expert` |
| **core** | `zod`, `typescript-expert`, `security` |
| **always** | `engineering-insights` (preloaded; read at Step 1 without invoking) |

**Design principles:**

- **TDD red-green-refactor** — for every new behaviour: write failing test → run and confirm
  red (show output) → write minimum implementation → confirm green → refactor. The "show the
  failing test output" step is non-negotiable: without a witnessed red run, there is no proof
  the test tests anything. AI agents that skip this step produce pass-by-construction tests
  (`assert add(2,3) == add(2,3)`).
- **Single-responsibility** — one task, in scope; never refactors neighbouring files; out-of-scope
  findings go in the final report. Stops and asks before expanding scope.
- **Owned paths are absolute** — without worktree isolation, Owned paths discipline is the only
  physical barrier between parallel agents. Violating it causes merge conflicts and silent data
  corruption (fintech production incident: merged API didn't validate login response shape,
  exposed stale session tokens).
- **Collect-all-then-report** — runs all verification phases (tests + typecheck + diff-review)
  before stopping. Collects every failure, then fixes. Does not fix the first issue and ask
  "what next?".
- **Diff-review as catch-all** — reviews own diff for what tests do not catch: missing null checks,
  `async` without `await`, hardcoded secrets, unexpected file deletions.
- **Full status enum** — four structured exit statuses; never silently fails or invents missing
  context:
  - `DONE` — all gates green, diff clean
  - `DONE_WITH_CONCERNS` — green but a medium issue the coordinator should decide on
  - `NEEDS_CONTEXT` — missing data/contract; stops immediately rather than guessing
  - `BLOCKED` — must edit outside Owned paths or touch a protected file
- **Self-verify ≠ final review** — self-verification (tests + typecheck + diff-review) is a
  required gate before DONE, but it does not replace the coordinator's separate review step.
  Self-check catches tooling issues; semantic review is a separate pass.
- **Local verify mirrors CI** — if local verification passes, CI should pass too.
- **Forbidden files** — never touches lockfiles, `server/src/db/migrations/`, root config, `.env*`,
  deployment scripts, or existing shared contracts without explicit task assignment.
- **Closes the loop** — appends non-obvious findings to `<module>/INSIGHTS.md` via
  `engineering-insights` so the next Implementer reads them at Step 1.

**Sources:**
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Effective harnesses for long-running agents (Anthropic)](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- [Parallel Claude Code Agents (aakashx)](https://www.aakashx.com/blog/parallel-claude-code-agents/)
- [Sub-Agent Best Practices (claude.fast)](https://claudefa.st/blog/guide/agents/sub-agent-best-practices)
- [9 Parallel AI Agents That Review My Code (hamy.xyz)](https://hamy.xyz/blog/2026-02_code-reviews-claude-subagents)
- [Superpowers Framework: TDD for AI Agents 2026 (baeseokjae)](https://baeseokjae.github.io/posts/superpowers-framework-ai-coding-2026/)
- [Are Coding Agents Generating Over-Mocked Tests? (arXiv 2602.00409)](https://arxiv.org/html/2602.00409v1)
- [6 Critical Mistakes in Agentic AI Engineering (DecodingAI)](https://www.decodingai.com/p/agentic-ai-engineering-guide-6-mistakes)
- [Quality Gates That Actually Run (Erik Lieben)](https://eriklieben.com/posts/agentic-dev-workflow-quality-gates/)
- [Where to Gate Your AI Coding Agent (codeongrass)](https://codeongrass.com/blog/where-to-gate-your-ai-coding-agent-3-checkpoint-framework/)

---

### Test Writer — [`test-writer.md`](test-writer.md)

**Purpose:** Adds or extends unit and integration tests for the DevDigest client (React/RTL),
server (Fastify/Vitest), or reviewer-core engine. Writes only test files; self-verifies by
running the suite + typecheck before finishing.

**Model:** `sonnet` | **Tools:** `Read, Glob, Grep, Edit, Write, Bash, Skill, TodoWrite`

**When to use:**
- Adding test coverage to an existing module
- A task from a Development Plan is specifically about writing tests
- Proactively when a PR adds new logic without corresponding tests

**Sources:**
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- [Unit Testing AI Agents: Mocking LLM Calls (CallSphere)](https://callsphere.ai/blog/unit-testing-ai-agents-mocking-llm-calls-deterministic-tests)
- [Blazing fast Prisma and Postgres tests in Vitest (Codepunkt)](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/)
- [Flaky tests in Vitest (Mergify)](https://mergify.com/flaky-tests/vitest/)
- [When AI-generated tests pass but miss the bug (dev.to/jamesdev4123)](https://dev.to/jamesdev4123/when-ai-generated-tests-pass-but-miss-the-bug-a-postmortem-on-tautological-unit-tests-2ajp)
- [AI-generated tests as ceremony (ploeh blog)](https://blog.ploeh.dk/2026/01/26/ai-generated-tests-as-ceremony/)
- [Task Decomposition Techniques (SparkCo)](https://sparkco.ai/blog/deep-dive-into-agent-task-decomposition-techniques)

---

### Architecture Reviewer — [`architecture-reviewer.md`](architecture-reviewer.md)

**Purpose:** Read-only architectural auditor. Audits a diff or file set against DevDigest's
structural contracts (onion layering, DI discipline, reviewer-core isolation, shared-contract
sync, process.env leakage). Reports violations with rule citations; never edits files.

**Model:** `opus` | **Tools:** `Read, Glob, Grep, Skill`

**When to use:**
- Before merging a PR that touches server module boundaries, shared contracts, or reviewer-core
- When a diff is flagged for potential architectural drift
- Proactively on AI-generated diffs (AI assistants produce architectural violations that look
  correct and keep running until a future refactor exposes the cost)

**Sources:**
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- [9 Parallel AI Agents That Review My Code (hamy.xyz)](https://hamy.xyz/blog/2026-02_code-reviews-claude-subagents)
- [Agentic Code Review (Addy Osmani)](https://addyosmani.com/blog/agentic-code-review/)
- [Clean Architecture in the Age of AI (dev.to/uxter)](https://dev.to/uxter/clean-architecture-in-the-age-of-ai-preventing-architectural-liquefaction-5d8d)
- [Enforce Clean Architecture with fresh-onion (dev.to/remojansen)](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)

---

## Parallel execution pattern

```
Planner → docs/plans/<name>.md
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
  T-01      T-02      T-03      ← same phase, non-overlapping Owned paths → run concurrently
(backend)   (ui)   (contracts)
    │         │
    └────┬────┘
         ▼
       T-04                     ← depends on T-01 + T-02; dispatched after both return DONE
```

**Contracts-first ordering** — shared types and API shapes are always Phase 1. Parallel agents
must not invent contracts independently; the failure mode is local tests passing while the
merged API silently breaks.

**Owned paths** — split work by directory/layer/test surface, not by abstract feature labels.
Good: `src/api/auth/*` vs `src/session/*` vs `src/components/login/*`.
Bad: "Agent 1: do auth, Agent 2: do login" (both touch shared files and directory).

**Status flow:**

```
Implementer runs
    │
    ├─ DONE                → coordinator dispatches task reviewer, marks complete
    ├─ DONE_WITH_CONCERNS  → coordinator reads concern, decides before reviewer
    ├─ NEEDS_CONTEXT       → coordinator provides missing info, re-dispatches
    └─ BLOCKED             → coordinator resolves protected-path conflict, re-dispatches
```

**Optional: full branch isolation** — add `isolation: worktree` to an Implementer's frontmatter
to run it in a separate git worktree. Note: branches from the repo's default branch (`main`),
not from the current feature branch. For feature-branch parallel work, use
`superpowers:using-git-worktrees` instead.
