# mcp-server — insights

Accumulated lessons, gotchas, and non-obvious decisions for `@devdigest/mcp-server`.

## What Works

## What Doesn't Work

- 2026-07-01: No MCP tool resolves a GitHub PR number to the `pull_id` UUID that `get_findings`/`run_agent_on_pr` require — had to query Postgres directly (`select id from pull_requests where number=...`) to bridge PR #N → pull_id. (`mcp-server/`)

## Codebase Patterns

## Tool & Library Notes

- 2026-07-02: On a Windows/newer git, running `git diff` outside a repo prints `warning: Not a git repository` (capital N, "warning" not "fatal") followed by the full `git diff --help` text, not the classic Linux `fatal: not a git repository`. A case-sensitive `message.includes('not a git repository')` check misses this and lets the raw help dump leak to the user — match case-insensitively (`message.toLowerCase().includes('not a git repository')`). (`mcp-server/src/cli.ts` — `getWorkingDiff`)
- 2026-07-01: Project-scoped MCP servers in `.claude/settings.json` require explicit approval via Claude Code CLI `/mcp` command before they work — they won't auto-connect even if configured and working. If `~/.claude.json` shows empty `enabledMcpjsonServers` and `disabledMcpjsonServers` arrays, the server was never approved. Fix: run `/mcp`, find the server with "needs approval" status, approve it. Alternative: move config to `.mcp.json` in project root (standard documented location for project-scoped servers). (`.claude/settings.json:38`)

## Recurring Errors & Fixes

## Session Notes

- 2026-07-01: `get_findings` returns the latest review's findings but not which agent produced them — to confirm "was this the Security Reviewer's run," had to cross-check `agent_runs` (joined to `agents`) in Postgres by `pr_id`, since the MCP response has no `agent_id`/`agent_name` field.

## Open Questions

- Should `get_findings`/`run_agent_on_pr` accept `{owner, repo, pull_number}` as an alternative to `pull_id`, or should a `find_pull` lookup tool be added? Same question for surfacing `agent_id`/`agent_name` on each finding/review so callers don't need direct DB access to attribute a run to an agent.
