import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Roles } from './common/decorators/roles.decorator';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: '服务健康检查' })
  index(): string {
    return 'OK';
  }

  @Get('time')
  @ApiOperation({ summary: '服务器当前时间' })
  getTime() {
    return new Date();
  }

  /**
   * Machine-readable AI context document.
   * Share this URL with any AI agent to let it understand
   * the Leverage platform's judge/bot protocol and MCP tools.
   */
  @Get('ai')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({ summary: 'AI context document (public)' })
  getAiContext(): string {
    return `# Leverage OJ — AI Context

Leverage is a competitive programming platform where you write **judges** (game rules) and **bots** (AI players).
Share this document with any AI agent to let it design and submit games autonomously.

---

## Platform API

Base URL: (configured by admin, e.g. https://leverage.example.com)

All API calls require a JWT bearer token in the Authorization header:
  Authorization: Bearer <token>

Get a token by logging in: POST /auth/login  { "username": "...", "password": "..." }

---

## Judge protocol

The judge is a long-running process that controls the game flow.

Each round, the judge receives via stdin:
  {"round": N, "responses": {"0": "<bot0_output>", "1": "<bot1_output>"}}

And must print to stdout:
  {
    "commands": {"0": <data_for_bot0>, "1": <data_for_bot1>},
    "display":  <any_display_data>,
    "verdict":  "continue" | "finish",
    "scores":   {"0": 1, "1": 0},   // only when verdict == "finish"
    "debug":    "optional string"
  }

Rules:
- On round 1, responses is {} — send initial commands to all bots
- Include scores ONLY when verdict == "finish"
- Always flush stdout after each print (sys.stdout.flush() in Python)

---

## Bot protocol

Each round the bot receives the judge's commands[pid] as a JSON line on stdin.
The bot outputs its move to stdout (JSON or plain text, whatever the judge expects).

Python template:
  import sys, json
  while True:
      line = sys.stdin.readline()
      if not line: break
      data = json.loads(line)
      move = 0  # your logic here
      print(json.dumps({"move": move, "debug": "my reasoning"}))
      sys.stdout.flush()

---

## Playground API

Test a judge + two bots without saving anything:

POST /compete/games/{gameId}/playground-judge
  Body: {
    "judgerCode": "...",
    "judgerLanguage": "python",
    "bot0": { "code": "...", "language": "python" },
    "bot1": { "code": "...", "language": "python" }
  }
  Returns: { "matchId": 123, "testGamerIds": [1, 2] }

Then poll GET /compete/matches/{matchId} until status != "running":
  Returns: { "status": "finished", "gameLog": { "rounds": [...], "finalResult": {...} } }

gameLog.rounds[n]:
  - judgeCmd.display: what the judge sent to display
  - botResponses: { "0": move0, "1": move1 }
  - judgeCmd.verdict: "continue" | "finish"
  - debug: { judge: "...", bot_0: "...", bot_0_stderr: "..." }

---

## Submit judge/renderer (admin token required)

Update game judger:
  PATCH /compete/games/{gameId}
  Body: { "judgerCode": "...", "judgerLanguage": "python" }

Update game renderer (HTML):
  PATCH /compete/games/{gameId}
  Body: { "rendererHtml": "<html>...</html>" }

Get current judger:
  GET /compete/games/{gameId}/judger
  Returns: { "judgerCode": "...", "judgerLanguage": "..." }

---

## Submit a bot

POST /compete/gamers
  Body: {
    "gameId": 1,
    "title": "MyBot",
    "code": "...",
    "language": "python",
    "opensource": false
  }
  Returns: { "id": 456, ... }

---

## List games

GET /compete/games?page=1&perPage=20
  Returns: { "items": [{ "id": 1, "title": "Nim", "gamerQuantity": 2, ... }], "total": N }

---

## List bots for a game

GET /compete/gamers?gameId=1&page=1&perPage=20
  Returns: { "items": [{ "id": 1, "title": "MyBot", "elo": 1200, ... }], "total": N }

---

## Supported languages

  python / python3   — Python 3
  cpp17              — C++17
  java               — Java
  javascript         — Node.js

---

## MCP Server (for MCP-compatible AI clients)

The Leverage MCP server wraps this API as MCP tools.

Available tools:
  list_games       — list all games
  test_judge       — test judge + bots in playground, returns rounds
  test_bot         — test a bot against an existing opponent
  get_leaderboard  — get game leaderboard
  list_gamers      — list bots for a game
  get_match_result — get full match result by matchId
  submit_bot       — submit a new bot
  submit_judge     — update game judger (admin token)
  submit_renderer  — update game renderer HTML (admin token)
  get_judge        — get current judger code for a game

Setup:
  LEVERAGE_TOKEN=<jwt> pnpm --dir /path/to/leverage-backend-neo run mcp

Claude Desktop config (~/.config/claude_desktop_config.json):
  {
    "mcpServers": {
      "leverage": {
        "command": "pnpm",
        "args": ["--dir", "/path/to/leverage-backend-neo", "run", "mcp"],
        "env": { "LEVERAGE_TOKEN": "<jwt>", "LEVERAGE_BASE_URL": "<api_url>" }
      }
    }
  }

---

## Renderer protocol

The renderer is a standalone HTML page in a sandboxed iframe.
It receives game state via window.postMessage:

  // Replay mode
  window.addEventListener('message', e => {
    if (e.data.type !== 'gameLog') return;
    const { gameLog, round } = e.data;
    const display = gameLog.rounds[round]?.judgeCmd?.display;
    // render display...
  });

  // Human turn (live game)
  window.addEventListener('message', e => {
    if (e.data.type !== 'gameState') return;
    const { gameState, playerIndex } = e.data;
    const latestInput = JSON.parse(gameState.requests[gameState.requests.length - 1]);
    // show UI for player to make a move
  });

---

## Common mistakes

- Forgetting sys.stdout.flush() → deadlock / TLE
- Not handling first round where responses is {} 
- Sending scores in non-finish rounds
- Judge exiting before verdict=finish
- Bot not reading stdin before printing

---
Generated by Leverage OJ. For the full developer guide visit /docs.
`;
  }

  @Get('stat')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiOperation({ summary: '全局数据统计（supervisor+）' })
  getStat() {
    return this.appService.getStat();
  }
}
