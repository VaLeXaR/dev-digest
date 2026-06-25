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
codebase or the public internet, returning it in a structured format. Never modifies files.

**Model:** `sonnet` | **Tools:** `Read, Glob, Grep, Bash, WebSearch, WebFetch`

**When to use:**

- Finding where a symbol, feature, or pattern is defined or used in the codebase
- Looking up library docs, API specs, or best practices from the web
- Fact-checking before architectural decisions
- Delegated discovery from the Planner (keeps Planner context clean)

**Design principles:**

- **Interview first** — stops and asks 1–4 clarifying questions before searching when the
  request has no explicit question, ambiguous scope, or missing parameters. Offers a best-guess
  default for each question so the user can confirm fast.
- **Mode separation** — Project mode (Glob/Grep/Read), Internet mode (WebSearch/WebFetch),
  or Mixed; chooses only the tools the mode requires.
- **Cite everything** — every project finding includes `path:line`; every web finding includes
  a source URL. No claim without a locator.
- **Honest about gaps** — never invents facts; reports "Not found" explicitly.
- **Bounded search** — ≤ 5 WebSearch queries; prefers official docs → source repos → articles.

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

- **`description` as routing signal** — written as a trigger rule so Claude auto-delegates
  planning tasks without an explicit prompt.
- **Clarify first** — asks questions before planning when the request is ambiguous or too broad;
  offers best-guess defaults so the user can confirm fast.
- **Opus for architecture** — model tiering: Opus handles design/architecture; Sonnet handles
  execution. Cost/capability routing prevents over-spending on routine tasks.
- **Contracts first** — shared types, API shapes, and DB migrations become the earliest tasks;
  parallel Implementers must not invent shared contracts independently (failure mode: parallel
  agents whose local tests both pass, but the merged API fails to validate response shape).
- **Pre-flight contradiction scan** — before Task 1 dispatches, the Red-flags check scans
  Requirements and Architecture notes for internal contradictions.
- **Independently mergeable phases** — each phase must produce a self-consistent state; Phase 2
  must not leave the codebase broken until Phase 3 completes.
- **Per-task risk classification** — Low / Medium / High risk per task, with a "Why" rationale
  tied to a specific requirement.
- **DAG dependency model** — `Depends-on` points only to earlier tasks; no cycles; concurrent
  tasks have non-overlapping Owned paths.
- **Owned paths never overlap** — since Implementers run without automatic worktree isolation
  by default, two concurrent tasks must not list the same file.
- **Handoff via written artifact** — plan written to `docs/plans/<name>.md`; survives context
  resets; Implementers read the file, not a conversation message.
- **Delegation via Agent** — heavy codebase discovery delegated to `researcher` or `Explore`
  subagents, keeping Planner context clean for architecture decisions.
- **INSIGHTS first** — reads `<module>/INSIGHTS.md` for every affected module, folds relevant
  gotchas into each task's `Known gotchas` field.

**Sources:** [1], [2], [3], [4], [5], [6], [7], [8], [9]

---

### Implementer — [`implementer.md`](implementer.md)

**Purpose:** Executes exactly one task from a Development Plan. Writes code, runs the module's
existing tests after each significant change, and stops when tests and typecheck are green.

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

- **`description` as trigger rule** — written for auto-delegation on implementation tasks.
- **Sonnet for implementation** — model tiering; Sonnet is the right cost/capability tier for
  code execution tasks.
- **Single-responsibility** — one task, in scope; never refactors neighbouring files or
  "improves" code outside Owned paths; out-of-scope findings go in the final report.
- **One task, one goal, one handoff rule** — each Implementer has a Definition of Done derived
  directly from the task's `Acceptance` field.
- **INSIGHTS first** — reads `<module>/INSIGHTS.md` at the module root as the mandatory first
  step, before opening any source file. (`engineering-insights` is preloaded in frontmatter so
  this knowledge is available immediately.)
- **Per-type skill loading** — domain skills injected lazily via Skill tool based on task type;
  avoids loading all 12 skills into context when only 7–8 are relevant.
- **Forbidden files** — never touches lockfiles (`pnpm-lock.yaml`, `package-lock.json`),
  `server/src/db/migrations/`, root config files, `.env*`, deployment scripts, or existing
  shared contracts without explicit task assignment.
- **Test gate** — runs the module's test command after each meaningful batch of changes;
  does not move to the next file while tests are red; never self-asserts "looks done."
- **Explicit done condition** — 5-point checklist before reporting result: tests pass,
  TypeScript clean, migration run if schema changed, both vendor copies in sync if contracts
  changed, no files outside Owned paths modified.
- **Honest blocking** — outputs `TASK BLOCKED` with failing output and required action rather
  than claiming done when tests are red.
- **Closes the loop** — appends non-obvious findings to `<module>/INSIGHTS.md` via
  `engineering-insights` so the next Implementer reads them at Step 1.

**Sources:** [1], [2], [3], [4], [7], [8], [10]

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
       T-04                     ← depends on T-01 + T-02; dispatched after both TASK COMPLETE
```

**Contracts-first ordering** — shared types and API shapes are always Phase 1. Parallel agents
must not invent contracts independently; the failure mode is local tests passing while the
merged API silently breaks.

**Owned paths** — split work by directory/layer/test surface, not by abstract feature labels.
Good: `src/api/auth/*` vs `src/session/*` vs `src/components/login/*`.
Bad: "Agent 1: do auth, Agent 2: do login" (both touch shared files).

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
| [3] | [Extend Claude with skills](https://code.claude.com/docs/en/skills) | Official Anthropic docs | Lazy vs eager loading; 1,536-char description cap; `disable-model-invocation`; dynamic context injection via shell preprocessing | Planner, Implementer |
| [4] | [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Anthropic Engineering blog | Separate exploration from execution; executors need clear objectives and boundaries; effort budget for orchestrator | Planner, Implementer |
| [5] | [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Anthropic Engineering blog | Persisted structured state (plan file) survives context resets; mark passing only after careful testing | Planner, Implementer |
| [6] | [wshobson/agents](https://github.com/wshobson/agents) | OSS reference (wshobson) | 5-tier model routing (Opus=architecture, Sonnet=implementation, Haiku=fast ops); single-responsibility plugin architecture; cross-harness portability | Planner, Implementer |
| [7] | [affaan-m/everything-claude-code · planner.md](https://github.com/affaan-m/everything-claude-code/blob/main/agents/planner.md) | OSS reference (affaan-m) | Independently mergeable phases; per-step risk classification; "Why" rationale per task; edge-case thinking baked in | Planner |
| [8] | [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) | Community article | Description writing rules; single-responsibility with explicit Definition of Done; when NOT to spawn (workflows needing visible incremental steps) | All |
| [9] | [Parallel Claude Code Agents: Safe Workflow Guide](https://www.aakashx.com/blog/parallel-claude-code-agents/) | Community article | Owned paths by directory/layer (not abstract feature); forbidden files list; contracts-first with real failure-mode example; worktree vs same-branch tradeoffs | Planner |
| [10] | [The SKILL.md Pattern](https://bibek-poudel.medium.com/the-skill-md-pattern-how-to-write-ai-agent-skills-that-actually-work-72a3169dd7ee) | Community article (Bibek Poudel) | Three-level context injection (discovery→activation→execution); frontmatter structure; description precision | All |
| [11] | [Stop Engineering Prompts, Start Engineering Context](https://medium.com/@muhammad.shafat/stop-engineering-prompts-start-engineering-context-a-guide-to-the-agent-skills-standard-bc8e2056f40a) | Community article (Muhammad Shafat) | SKILL.md standard; discovery-level vs activation-level context as token budget strategy | All |
