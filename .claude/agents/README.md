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

**Sources:** [1], [2], [8]

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
  intervention. [8], [17], [22]
- **Self-contained tasks (first-invocation-carries-everything)** — implementer subagents have
  isolated context windows and cannot pause to ask questions mid-run. Every task carries exact
  file paths, contract references, and acceptance criteria. No "see T-01" or "same as above." [8], [14]
- **Concrete task descriptions** — Bad: "Update the auth service." Good: "Add rate-limiting to
  `server/src/modules/auth/routes.ts`: return 429 when user exceeds 10 req/min via injected
  `CacheAdapter`." Abstract descriptions cause file-ownership ambiguity and parallel conflicts. [14]
- **Goldilocks granularity** — too large = wasted parallelism; too small = coordination overhead
  beats the gain. A well-sized task touches one owned-path domain, ≤5 files, one acceptance
  command. If a task spans two independent domains → split. If two tasks always run together → merge. [17], [18]
- **Shorter tasks fail less** — doubling task duration roughly quadruples failure rate. Keep
  tasks atomic; put integration edge-cases (auth, rate limits, error formats) in their own explicit
  tasks rather than hidden inside implementation tasks. [19]
- **Contracts first** — shared types, API shapes, and DB migrations are the earliest tasks.
  Parallel implementers must not invent shared contracts independently. Real failure mode: two
  agents whose local tests both pass, but the merged API silently breaks response-shape validation. [9], [17]
- **Owned paths at file AND directory level** — since implementers run on the same branch without
  automatic worktree isolation, two concurrent tasks must not share a file or parent directory.
  Concurrent tasks touching the same directory risk merge conflicts even without touching the same file. [9], [17], [18]
- **DAG dependency model** — `Depends-on` points only to earlier tasks; no cycles; independent
  tasks marked for concurrent execution. [17], [18]
- **Pre-flight contradiction scan** — Red-flags check scans Requirements and Architecture notes
  for internal contradictions before Task 1 dispatches. [7]
- **Independently mergeable phases** — each phase must produce a self-consistent state; Phase 2
  must not leave the codebase broken until Phase 3 completes. [7]
- **Over-engineering guard** — start with the simplest solution. Prove the core task works first.
  Use a multi-phase DAG only when a linear plan genuinely cannot satisfy the requirements. [22]
- **INSIGHTS first** — reads `<module>/INSIGHTS.md` for every affected module, folds relevant
  gotchas into each task's `Known gotchas` field. [4], [5]
- **Delegation via Agent** — heavy codebase discovery delegated to `researcher` or `Explore`
  subagents, keeping Planner context clean for architecture decisions. [4]

**Sources:** [1], [2], [4], [5], [7], [8], [9], [14], [17], [18], [19], [22]

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
  (`assert add(2,3) == add(2,3)`). [20], [21]
- **Single-responsibility** — one task, in scope; never refactors neighbouring files; out-of-scope
  findings go in the final report. Stops and asks before expanding scope. [8]
- **Owned paths are absolute** — without worktree isolation, Owned paths discipline is the only
  physical barrier between parallel agents. Violating it causes merge conflicts and silent data
  corruption (fintech production incident: merged API didn't validate login response shape,
  exposed stale session tokens). [9], [14]
- **Collect-all-then-report** — runs all verification phases (tests + typecheck + diff-review)
  before stopping. Collects every failure, then fixes. Does not fix the first issue and ask
  "what next?". [23]
- **Diff-review as catch-all** — reviews own diff for what tests do not catch: missing null checks,
  `async` without `await`, hardcoded secrets, unexpected file deletions. [23]
- **Full status enum** — four structured exit statuses; never silently fails or invents missing
  context:
  - `DONE` — all gates green, diff clean
  - `DONE_WITH_CONCERNS` — green but a medium issue the coordinator should decide on
  - `NEEDS_CONTEXT` — missing data/contract; stops immediately rather than guessing
  - `BLOCKED` — must edit outside Owned paths or touch a protected file
- **Self-verify ≠ final review** — self-verification (tests + typecheck + diff-review) is a
  required gate before DONE, but it does not replace the coordinator's separate review step.
  Self-check catches tooling issues; semantic review is a separate pass. [23], [15]
- **Local verify mirrors CI** — if local verification passes, CI should pass too. [23]
- **Forbidden files** — never touches lockfiles, `server/src/db/migrations/`, root config, `.env*`,
  deployment scripts, or existing shared contracts without explicit task assignment. [9]
- **Closes the loop** — appends non-obvious findings to `<module>/INSIGHTS.md` via
  `engineering-insights` so the next Implementer reads them at Step 1. [4], [5]

**Sources:** [1], [2], [4], [5], [8], [9], [14], [15], [20], [21], [22], [23], [24]

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

**Sources:** [2], [8], [25], [26], [27], [28], [29], [30]

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

**Sources:** [2], [8], [15], [16], [31], [32]

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

---

## Sources

| # | Source | Type | Key contribution | Used by |
| --- | --- | --- | --- | --- |
| [1] | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | Official Anthropic docs | Explore→Plan→Implement→Commit workflow; give agents a runnable check; review in fresh context | All |
| [2] | [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) | Official Anthropic docs | Full frontmatter spec (`isolation`, `disallowedTools`, `permissionMode`, `maxTurns`); `description` as routing signal; `skills:` eager loading; max nesting depth 5 | All |
| [3] | [Extend Claude with skills](https://code.claude.com/docs/en/skills) | Official Anthropic docs | Lazy vs eager loading; 1,536-char description cap; `disable-model-invocation`; dynamic context injection | Planner, Implementer |
| [4] | [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Anthropic Engineering | Separate exploration from execution; executors need clear objectives and boundaries | Planner, Implementer |
| [5] | [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Anthropic Engineering | Persisted structured state survives context resets; mark passing only after careful testing | Planner, Implementer |
| [6] | [wshobson/agents](https://github.com/wshobson/agents) | OSS reference | 5-tier model routing (Opus=architecture, Sonnet=implementation, Haiku=fast ops) | Planner, Implementer |
| [7] | [affaan-m/everything-claude-code · planner.md](https://github.com/affaan-m/everything-claude-code/blob/main/agents/planner.md) | OSS reference | Independently mergeable phases; per-step risk classification; "Why" rationale per task | Planner |
| [8] | [Best practices for Claude Code subagents — PubNub](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) | Community article | Single-responsibility + DoD checklist; explicit tool scoping; disjoint-slugs parallel rule; "ask before out-of-scope refactor"; "no planning mode" in subagents | All |
| [9] | [Parallel Claude Code Agents — aakashx](https://www.aakashx.com/blog/parallel-claude-code-agents/) | Community article | Owned paths by directory/layer (not abstract feature); protected files list; contracts-first with real production-incident failure mode; worktree vs same-branch tradeoffs | Planner, Implementer |
| [10] | [The SKILL.md Pattern — Bibek Poudel](https://bibek-poudel.medium.com/the-skill-md-pattern-how-to-write-ai-agent-skills-that-actually-work-72a3169dd7ee) | Community article | Three-level context injection; frontmatter structure; description precision | All |
| [11] | [Stop Engineering Prompts, Start Engineering Context — Muhammad Shafat](https://medium.com/@muhammad.shafat/stop-engineering-prompts-start-engineering-context-a-guide-to-the-agent-skills-standard-bc8e2056f40a) | Community article | SKILL.md standard; discovery-level vs activation-level context as token budget strategy | All |
| [14] | [Sub-Agent Best Practices — claude.fast](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) | Community article | "First-invocation-carries-everything"; bad vs good task descriptions; parallel conditions (3 required) vs sequential triggers; dependency chain examples (Schema→API→Frontend) | Planner, Implementer |
| [15] | [9 Parallel AI Agents That Review My Code — hamy.xyz](https://hamy.xyz/blog/2026-02_code-reviews-claude-subagents) | Community article | Scope priority system (user→branch→staged→commit); tier by blast radius; verdict tiers (Ready/Needs Attention/Needs Work); self-verify improves outcomes from <50% to ~75% | Architecture Reviewer, Implementer |
| [16] | [Agentic Code Review — Addy Osmani](https://addyosmani.com/blog/agentic-code-review/) | Community article | Findings are sensor data not a verdict; tier review effort by risk; heterogeneous reviewers catch more; watch for CI gate weakening in AI-generated diffs | Architecture Reviewer |
| [17] | [Agent Teams: Parallel + Shared Task List — MindStudio](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-shared-task-list) | Community article | Goldilocks-granularity tradeoff; task schema (id/description/status/dependencies/output); three conflict patterns (fully-independent / sequential / file-level) | Planner |
| [18] | [Parallel Agents Coordinate Through Orchestrator — MindStudio](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-agents) | Community article | Prerequisite gate; communicate-through-state not chatter; file isolation rule | Planner |
| [19] | [AI Agent Harness Failures: 13 Anti-Patterns — Atlan](https://atlan.com/know/agent-harness-failures-anti-patterns/) | Community article | Compounding error cascade (0.85^10); tool bloat; silent failure is most dangerous; All-or-Nothing Autonomy (Replit incident) | Planner, Implementer |
| [20] | [Superpowers Framework: TDD for AI Agents 2026 — baeseokjae](https://baeseokjae.github.io/posts/superpowers-framework-ai-coding-2026/) | Community article | Red→Green→Refactor cycle; test-writing subagent never sees implementation; pass-by-construction anti-pattern; 85–95% coverage vs 30–50% baseline | Implementer, Test Writer |
| [21] | [Are Coding Agents Generating Over-Mocked Tests? — arXiv 2602.00409](https://arxiv.org/html/2602.00409v1) | Research paper (MSR '26) | AI agents over-mock 36% vs 26% for humans; mock gets out of sync with implementation; only 11.6% CLAUDE.md files contain mock instructions — must be explicit | Test Writer |
| [22] | [6 Critical Mistakes in Agentic AI Engineering — DecodingAI](https://www.decodingai.com/p/agentic-ai-engineering-guide-6-mistakes) | Community article | Scarce context window; don't over-engineer; schema-at-generation; planning-in-the-loop; binary evals day-one | Planner, Implementer |
| [23] | [Quality Gates That Actually Run — Erik Lieben](https://eriklieben.com/posts/agentic-dev-workflow-quality-gates/) | Community article | Collect-all-then-report; diff-review as catch-all gate (null checks, async/await, secrets, deletions); local verify must mirror CI | Implementer |
| [24] | [Where to Gate Your AI Coding Agent — codeongrass](https://codeongrass.com/blog/where-to-gate-your-ai-coding-agent-3-checkpoint-framework/) | Community article | 3-checkpoint framework (Plan/Findings/Diff); gate instructions must be near-top of prompt (get de-prioritized after many tool calls); list exact file paths before modifying | Implementer |
| [25] | [Unit Testing AI Agents: Mocking LLM Calls — CallSphere](https://callsphere.ai/blog/unit-testing-ai-agents-mocking-llm-calls-deterministic-tests) | Community article | FakeLLM with call_log; fixture library (normal/tool-call/refusal/malformed/empty); test retry-on-parse-failure; temperature=0 ≠ determinism | Test Writer |
| [26] | [Blazing fast Prisma and Postgres tests in Vitest — Codepunkt](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/) | Community article | Transaction+rollback per test (98% speedup); one baseline seed; savepoints for nested transactions; real DB over mocks | Test Writer |
| [27] | [Flaky tests in Vitest — Mergify](https://mergify.com/flaky-tests/vitest/) | Community article | vi.hoisted() for mock hoisting; restoreMocks:true; retry:N hides race bugs; no snapshot+concurrent mixing; no top-level await | Test Writer |
| [28] | [When AI-generated tests pass but miss the bug — dev.to/jamesdev4123](https://dev.to/jamesdev4123/when-ai-generated-tests-pass-but-miss-the-bug-a-postmortem-on-tautological-unit-tests-2ajp) | Community postmortem | Tautological tests: AI copies logic from implementation → confirms nothing; production incident: well-covered endpoint returned silently incorrect data | Test Writer |
| [29] | [AI-generated tests as ceremony — ploeh blog](https://blog.ploeh.dk/2026/01/26/ai-generated-tests-as-ceremony/) | Community article | "Tests work best when you have seen them fail"; post-facto generated tests skip the red phase; false sense of security | Test Writer |
| [30] | [SparkCo — Task Decomposition Techniques](https://sparkco.ai/blog/deep-dive-into-agent-task-decomposition-techniques) | Community article | Single-responsibility per agent; overloading anti-pattern; modularity | Planner |
| [31] | [Clean Architecture in the Age of AI — dev.to/uxter](https://dev.to/uxter/clean-architecture-in-the-age-of-ai-preventing-architectural-liquefaction-5d8d) | Community article | "Architectural liquefaction"; AI generates violations that look right and keep running; documented rules as deterministic shell around probabilistic execution | Architecture Reviewer |
| [32] | [Enforce Clean Architecture with fresh-onion — dev.to/remojansen](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) | Community article | Four-layer allowed-import matrix; violation output format (from-layer→to-layer→file); no native TS enforcement → agent is the only automated gate | Architecture Reviewer |
