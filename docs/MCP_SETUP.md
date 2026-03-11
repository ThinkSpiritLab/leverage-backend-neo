# Leverage MCP Server — Setup Guide

The Leverage MCP server exposes the Leverage platform's Playground API as MCP tools, enabling AI agents (Claude, Codex, etc.) to autonomously design, test, and iterate competitive games.

## Prerequisites

- Node.js 18+
- `pnpm` installed
- Leverage backend running at `http://localhost:3000` (or set `LEVERAGE_BASE_URL`)
- A valid JWT token for the Leverage API (`LEVERAGE_TOKEN`)

## Running the MCP Server

```bash
cd /path/to/leverage-backend-neo

# Install dependencies (first time)
pnpm install

# Run the MCP server
LEVERAGE_TOKEN=<your-jwt-token> pnpm run mcp

# Or with custom base URL
LEVERAGE_TOKEN=<token> LEVERAGE_BASE_URL=http://localhost:3000 pnpm run mcp
```

The server communicates via **stdio** (standard MCP transport), so it's compatible with Claude Desktop, OpenClaw, and any MCP-compatible client.

## Connecting from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "leverage": {
      "command": "pnpm",
      "args": ["--dir", "/Users/yuzhe/.openclaw/workspace/projects/leverage-backend-neo", "run", "mcp"],
      "env": {
        "LEVERAGE_TOKEN": "<your-jwt-token>",
        "LEVERAGE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Connecting from OpenClaw

Use the `mcporter` skill or add a stdio MCP server to your OpenClaw config pointing to:

```
LEVERAGE_TOKEN=<token> npx ts-node /path/to/leverage-backend-neo/src/mcp/leverage-mcp.ts
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_games` | List all games on the platform |
| `test_judge` | Test a custom judge with bots; returns full round-by-round results |
| `test_bot` | Test a bot against an existing opponent in a live match |
| `get_leaderboard` | Get ELO leaderboard for a game |
| `list_gamers` | List all bots registered for a game |
| `get_match_result` | Get full match result (rounds, scores, debug) by match ID |
| `submit_bot` | Submit a new bot to the platform |
| `submit_judge` | Upload/replace the judge program for a game (admin token required) |
| `submit_renderer` | Upload/replace the HTML renderer for a game (admin token required) |
| `get_judge` | Fetch the current judge source code for a game |
| `list_matches` | Find matches by gameId, gamerId, or status |
| `get_gamer` | Read a bot's metadata and source code |
| `analyze_match` | Pre-process a match result into debugHighlights for efficient AI debugging |

## Example AI conversation

> **User:** Design a Nim game with a Python judge (21 stones, take 1-3 per turn). Add two bots and put them on the leaderboard.

**What the AI will do:**

1. `list_games()` — check if Nim game already exists
2. Write judge code for Nim (21 stones, 2 players)
3. Write a simple "always take 1" bot
4. Write a smart "take `stones % 4`" bot
5. `test_judge(gameId=..., judgerCode=..., bot0Code=..., bot1Code=...)` — verify judge works
6. Check `rounds` — did the match finish correctly? Who won?
7. Fix any bugs, re-test until `verdict=finish`
8. `submit_bot(gameId=..., title="NimRandom", code=...)` — submit bot 0
9. `submit_bot(gameId=..., title="NimStrategist", code=...)` — submit bot 1
10. `get_leaderboard(gameId=...)` — confirm bots appear
11. _(optional)_ `analyze_match(matchId=...)` — get `debugHighlights` for fast debugging if something looks off

See `GAME_DESIGN.md` for the full judge/bot protocol specification.

## Development

```bash
# Type-check the MCP server
pnpm exec tsc --noEmit --project tsconfig.json

# Run directly with ts-node
LEVERAGE_TOKEN=test node_modules/.bin/ts-node \
  --project tsconfig.json \
  src/mcp/leverage-mcp.ts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LEVERAGE_TOKEN` | Yes | — | JWT bearer token for Leverage API |
| `LEVERAGE_BASE_URL` | No | `http://localhost:3000` | Base URL of Leverage backend |
