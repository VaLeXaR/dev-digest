# @devdigest/mcp-server

Local MCP server that exposes DevDigest review tools to Claude (Desktop / Claude Code) over stdio.

## Prerequisites

- DevDigest server must be running at `:4001` — start everything with `./scripts/dev.sh` from the repo root.
- Node >= 22

## Build & run

```sh
cd mcp-server
pnpm install
pnpm build          # emits dist/index.js
node dist/index.js  # stdio MCP server (normally started by Claude, not manually)
```

Dev variant (no build step):

```sh
pnpm dev  # uses tsx, no compilation needed
```

## Manual testing with MCP Inspector

```sh
cd mcp-server
pnpm build
pnpm inspector
# runs: npx @modelcontextprotocol/inspector node dist/index.js
# opens http://localhost:5173 — list and call tools interactively
```

Note: the DevDigest server must be running at `:4001` for the tools to work.

## Environment variable

| Variable | Default | Description |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:4001` | Base URL of the DevDigest API |

Secrets (API keys, GitHub token) are owned by the DevDigest server — the MCP server never reads them.

## Tools

| Tool | Description |
|---|---|
| `list_agents` | List all configured review agents with their id, name, and description. |
| `run_agent_on_pr` | Run a review agent on a pull request and return findings when complete. |
| `get_findings` | Get the latest review findings for a pull request that has already been reviewed. |
| `get_conventions` | Get the coding conventions extracted from a repository. |
| `get_blast_radius` | Get the blast radius of a pull request (not yet implemented — always returns an error). |

## Claude config

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["/absolute/path/to/dev-digest/mcp-server/dist/index.js"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:4001"
      }
    }
  }
}
```

### Claude Code (`.claude/settings.json`)

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["/absolute/path/to/dev-digest/mcp-server/dist/index.js"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:4001"
      }
    }
  }
}
```

Dev variant (no build step required):

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/dev-digest/mcp-server/src/index.ts"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:4001"
      }
    }
  }
}
```

Important: the `args` path **must be absolute** — Claude launches the process with an arbitrary working directory.
