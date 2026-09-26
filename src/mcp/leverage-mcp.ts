#!/usr/bin/env node
/**
 * Leverage MCP Server
 * Exposes the Leverage platform's Playground API as MCP tools,
 * so an AI agent can autonomously design, test, and iterate games.
 *
 * Transport: stdio (standard MCP)
 * Auth: reads LEVERAGE_TOKEN from environment
 * Base URL: reads LEVERAGE_BASE_URL from environment (default: http://localhost:3000)
 *
 * Usage:
 *   LEVERAGE_TOKEN=<jwt> ts-node src/mcp/leverage-mcp.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { LEVERAGE_LANG_TO_BOTZONE, resolveBotzoneLanguage } from '../modules/botzone/botzone.types';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.LEVERAGE_BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.LEVERAGE_TOKEN ?? '';

if (!TOKEN) {
  process.stderr.write('[leverage-mcp] WARNING: LEVERAGE_TOKEN is not set\n');
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function apiPatch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Polling helper ───────────────────────────────────────────────────────────

/** Poll a match until verdict is not "continue" (or timeout). */
async function pollMatch(
  matchId: number,
  intervalMs = 2000,
  timeoutMs = 60000,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = (await apiGet(`/compete/matches/${matchId}`)) as Record<string, unknown>;
    const status = result.status;
    if (typeof status === 'number') {
      if (status === 2 || status === 3) return result;
    } else {
      // Compatibility for older text-status responses.
      const verdict = result.verdict as string | undefined;
      if (status === 'finished' || status === 'failed' ||
          (verdict && !['continue', 'running', 'pending'].includes(verdict))) return result;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Match ${matchId} timed out after ${timeoutMs}ms`);
}

/** Summarize rounds for compactness. */
function summarizeRounds(rounds: unknown[]): unknown[] {
  if (!Array.isArray(rounds)) return [];
  return rounds.map((r: unknown) => {
    const round = r as Record<string, unknown>;
    return {
      round: round.round,
      display: round.display,
      verdict: round.verdict,
      scores: round.scores,
      debug: round.debug,
    };
  });
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'leverage-mcp',
  version: '1.0.0',
});

// ── Tool: list_games ──────────────────────────────────────────────────────────

server.tool(
  'list_games',
  'List all available games on the Leverage platform.',
  {},
  async () => {
    const data = (await apiGet('/compete/games?perPage=100')) as Record<string, unknown>;
    const items = (data.items ?? data.data ?? data) as Record<string, unknown>[];
    const games = Array.isArray(items)
      ? items.map((g) => ({
          id: g.id,
          title: g.title,
          gamerQuantity: g.gamerQuantity,
        }))
      : data;
    return {
      content: [{ type: 'text', text: JSON.stringify(games, null, 2) }],
    };
  },
);

// ── Tool: test_judge ─────────────────────────────────────────────────────────

server.tool(
  'test_judge',
  'Test a custom judge with two bots. Runs a playground match using the provided judge code and two bot codes, polls until done, and returns the result with round summaries.',
  {
    gameId: z.number().int().describe('Game ID'),
    judgerCode: z.string().optional().describe('Judge source code. If omitted, uses the game\'s built-in judge.'),
    judgerLanguage: z
      .string()
      .optional()
      .default('python')
      .describe('Language for judge code, e.g. "python", "python3", "cpp17", "java", "javascript". Default: python'),
    bot0Code: z.string().optional().describe('Bot 0 (first player) source code. Either bot0Code or bot0GamerId must be provided.'),
    bot0Language: z.string().optional().describe('Language for bot0Code, e.g. "python", "python3", "cpp17"'),
    bot0GamerId: z.number().int().optional().describe('Use existing gamer ID for bot 0 instead of inline code'),
    bot1Code: z.string().optional().describe('Bot 1 (second player) source code. Either bot1Code or bot1GamerId must be provided.'),
    bot1Language: z.string().optional().describe('Language for bot1Code'),
    bot1GamerId: z.number().int().optional().describe('Use existing gamer ID for bot 1 instead of inline code'),
  },
  async (params) => {
    const {
      gameId,
      judgerCode,
      judgerLanguage,
      bot0Code,
      bot0Language,
      bot0GamerId,
      bot1Code,
      bot1Language,
      bot1GamerId,
    } = params;

    const body: Record<string, unknown> = {
      bot0: bot0GamerId ? { gamerId: bot0GamerId } : { code: bot0Code, language: bot0Language },
      bot1: bot1GamerId ? { gamerId: bot1GamerId } : { code: bot1Code, language: bot1Language },
    };
    if (judgerCode) {
      body.judgerCode = judgerCode;
      body.judgerLanguage = judgerLanguage ?? 'python';
    }

    const created = (await apiPost(
      `/compete/games/${gameId}/playground-judge`,
      body,
    )) as Record<string, unknown>;

    const matchId = (created.matchId ?? created.id) as number;
    if (!matchId) {
      return {
        content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
      };
    }

    const result = (await pollMatch(matchId)) as Record<string, unknown>;
    const rounds = summarizeRounds((result.rounds ?? result.log ?? []) as unknown[]);

    const summary = {
      matchId,
      verdict: result.verdict ?? result.status,
      finalResult: result.scores ?? result.finalResult ?? result.result,
      rounds,
      debug: result.debug,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  },
);

// ── Tool: test_bot ─────────────────────────────────────────────────────────────

server.tool(
  'test_bot',
  'Test a bot against an existing opponent gamer. Runs a playground match and returns the result.',
  {
    gameId: z.number().int().describe('Game ID'),
    code: z.string().describe('Bot source code'),
    language: z.string().describe('Language, e.g. "python", "python3", "cpp17", "java", "javascript"'),
    opponentGamerId: z.number().int().describe('Gamer ID of the opponent to play against'),
  },
  async ({ gameId, code, language, opponentGamerId }) => {
    const created = (await apiPost(`/compete/games/${gameId}/playground`, {
      code,
      language,
      opponentGamerId,
    })) as Record<string, unknown>;

    const matchId = (created.matchId ?? created.id) as number;
    if (!matchId) {
      return {
        content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
      };
    }

    const result = (await pollMatch(matchId)) as Record<string, unknown>;
    const rounds = summarizeRounds((result.rounds ?? result.log ?? []) as unknown[]);

    const summary = {
      matchId,
      verdict: result.verdict ?? result.status,
      finalResult: result.scores ?? result.finalResult ?? result.result,
      rounds,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  },
);

// ── Tool: get_leaderboard ─────────────────────────────────────────────────────

server.tool(
  'get_leaderboard',
  'Get the leaderboard for a game. Returns top entries with gamer info, ELO, and win/loss stats.',
  {
    gameId: z.number().int().describe('Game ID'),
    board: z.string().optional().default('inner').describe('Board type: "inner" (default) or "global"'),
    limit: z.number().int().optional().default(10).describe('Number of entries to return'),
  },
  async ({ gameId, board, limit }) => {
    const data = (await apiGet(
      `/compete/games/${gameId}/leaderboard?board=${board}&perPage=${limit}`,
    )) as Record<string, unknown>;
    const items = (data.items ?? data.data ?? data) as unknown[];
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
    };
  },
);

// ── Tool: list_gamers ─────────────────────────────────────────────────────────

server.tool(
  'list_gamers',
  'List bots (gamers) for a specific game.',
  {
    gameId: z.number().int().describe('Game ID'),
    perPage: z.number().int().optional().default(20).describe('Number of gamers to return'),
  },
  async ({ gameId, perPage }) => {
    const data = (await apiGet(
      `/compete/gamers?gameId=${gameId}&perPage=${perPage}`,
    )) as Record<string, unknown>;
    const items = (data.items ?? data.data ?? data) as unknown[];
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
    };
  },
);

// ── Tool: get_match_result ────────────────────────────────────────────────────

server.tool(
  'get_match_result',
  'Get the full result of a match, including all rounds and debug info.',
  {
    matchId: z.number().int().describe('Match ID'),
  },
  async ({ matchId }) => {
    const result = await apiGet(`/compete/matches/${matchId}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── Tool: submit_bot ──────────────────────────────────────────────────────────

server.tool(
  'submit_bot',
  'Submit a new bot (gamer) to the Leverage platform for a specific game.',
  {
    gameId: z.number().int().describe('Game ID'),
    title: z.string().describe('Bot name/title'),
    code: z.string().describe('Bot source code'),
    language: z.string().describe('Language, e.g. "python", "python3", "cpp17", "java", "javascript"'),
    opensource: z.boolean().optional().default(false).describe('Whether to make the bot open-source'),
  },
  async ({ gameId, title, code, language, opensource }) => {
    const result = (await apiPost('/compete/gamers', {
      gameId,
      title,
      code,
      language,
      opensource,
    })) as Record<string, unknown>;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { gamerId: result.id ?? result.gamerId, title: result.title, ...result },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Tool: submit_judge ────────────────────────────────────────────────────────

server.tool(
  'submit_judge',
  'Upload a custom judge program to a game (requires admin or sa token). ' +
  'Execution isolation is owned by the external judge; verify it before using untrusted code. ' +
  'Use test_judge first to validate your code before submitting.',
  {
    gameId: z.number().int().describe('Game ID to update'),
    judgerCode: z.string().describe('Judge source code (Python, C++, etc.)'),
    judgerLanguage: z.union([z.string(), z.number().int()]).optional().default('python')
      .describe('Runtime: python, cpp (C++17), javascript or typescript. Legacy numeric IDs 3/9/10/11 are accepted.'),
  },
  async ({ gameId, judgerCode, judgerLanguage }) => {
    const runtime = typeof judgerLanguage === 'number' ? LEVERAGE_LANG_TO_BOTZONE[judgerLanguage] : resolveBotzoneLanguage(judgerLanguage);
    if (!runtime) throw new Error('Unsupported Botzone judge language');
    const result = (await apiPatch(`/compete/games/${gameId}`, {
      judgerCode,
      judgerLanguage: runtime,
    })) as Record<string, unknown>;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, gameId, judgerLanguage: runtime, message: '裁判程序已更新' },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Tool: submit_renderer ─────────────────────────────────────────────────────

server.tool(
  'submit_renderer',
  'Upload an HTML renderer for a game (requires admin or sa token). ' +
  'The renderer is sandboxed in an iframe and receives game state via postMessage. ' +
  'Expected message types: gameLog ({type:"gameLog", gameLog, round}) and gameState ({type:"gameState", gameState, playerIndex}). ' +
  'Use the renderer tab in Playground to test before submitting.',
  {
    gameId: z.number().int().describe('Game ID to update'),
    rendererHtml: z.string().describe(
      'Full HTML string for the renderer. Must listen to window.postMessage for type="gameLog" and optionally type="gameState".',
    ),
  },
  async ({ gameId, rendererHtml }) => {
    await apiPatch(`/compete/games/${gameId}`, { rendererHtml });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, gameId, htmlLength: rendererHtml.length, message: '渲染器已更新' },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Tool: get_judge ───────────────────────────────────────────────────────────

server.tool(
  'get_judge',
  'Get the current judge code for a game (requires admin/supervisor token).',
  {
    gameId: z.number().int().describe('Game ID'),
  },
  async ({ gameId }) => {
    const result = (await apiGet(`/compete/games/${gameId}/judger`)) as Record<string, unknown>;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// ── Tool: list_matches ────────────────────────────────────────────────────────

server.tool(
  'list_matches',
  'List recent matches for a game or a specific bot (gamer). Use this to find matchIds you can then inspect with get_match_result.',
  {
    gameId: z.number().int().optional().describe('Filter by game ID'),
    gamerId: z.number().int().optional().describe('Filter by bot (gamer) ID — returns matches this bot participated in'),
    status: z.number().int().optional().describe('Filter by status: 0=pending, 1=running, 2=finished, 3=failed'),
    isTest: z.boolean().optional().describe('true = test/playground matches only; false = ranked only'),
    page: z.number().int().optional().default(1),
    perPage: z.number().int().optional().default(10),
  },
  async ({ gameId, gamerId, status, isTest, page, perPage }) => {
    const params = new URLSearchParams();
    if (gameId !== undefined) params.set('gameId', String(gameId));
    if (gamerId !== undefined) params.set('gamerId', String(gamerId));
    if (status !== undefined) params.set('status', String(status));
    if (isTest !== undefined) params.set('isTest', String(isTest));
    params.set('page', String(page ?? 1));
    params.set('perPage', String(perPage ?? 10));
    const data = (await apiGet(`/compete/matches?${params}`)) as Record<string, unknown>;
    const items = (data.items ?? data) as Record<string, unknown>[];
    const summary = Array.isArray(items)
      ? items.map((m) => ({
          id: m.id,
          status: m.status,
          isTest: m.isTest,
          createdAt: m.createdAt,
          gamers: (m.gamers as any[])?.map((g: any) => ({ id: g.id, title: g.title, elo: g.elo })),
          winner: (m.winner as any)?.title ?? null,
        }))
      : data;
    return {
      content: [{ type: 'text', text: JSON.stringify({ matches: summary, total: data.total }, null, 2) }],
    };
  },
);

// ── Tool: get_gamer ───────────────────────────────────────────────────────────

server.tool(
  'get_gamer',
  'Get details of a specific bot (gamer), including its code (if accessible). Useful for reading a user\'s bot to help debug or improve it.',
  {
    gamerId: z.number().int().describe('Bot (gamer) ID'),
  },
  async ({ gamerId }) => {
    const data = (await apiGet(`/compete/gamers/${gamerId}`)) as Record<string, unknown>;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: data.id,
              title: data.title,
              language: data.language,
              elo: data.elo,
              type: data.type,
              opensource: data.opensource,
              code: data.code ?? '(code not accessible — bot is not open-source or you lack permission)',
              disabled: data.disabled,
              gameId: data.gameId,
              createdAt: data.createdAt,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Tool: analyze_match ───────────────────────────────────────────────────────

server.tool(
  'analyze_match',
  'Get a match result with extracted debug info: judge debug strings, bot stderr, and a round-by-round summary. Better than get_match_result for debugging.',
  {
    matchId: z.number().int().describe('Match ID'),
  },
  async ({ matchId }) => {
    const result = (await apiGet(`/compete/matches/${matchId}`)) as Record<string, unknown>;
    const gameLog = result.gameLog as Record<string, unknown> | undefined;
    if (!gameLog) {
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const rounds = (gameLog.rounds as any[]) ?? [];
    const summary = rounds.map((r, i) => ({
      round: i + 1,
      display: r.judgeCmd?.display ?? r.display,
      botResponses: r.botResponses,
      verdict: r.judgeCmd?.verdict ?? r.verdict,
      judgeDebug: r.debug?.judge ?? r.judgeCmd?.debug,
      bot0Debug: r.debug?.bot_0 ?? r.debug?.['bot_0'],
      bot0Stderr: r.debug?.bot_0_stderr,
      bot1Debug: r.debug?.bot_1 ?? r.debug?.['bot_1'],
      bot1Stderr: r.debug?.bot_1_stderr,
    }));

    const output = {
      matchId: result.id,
      status: result.status,
      gamers: (result.gamers as any[])?.map((g: any) => ({ id: g.id, title: g.title, elo: g.elo })),
      finalResult: gameLog.finalResult,
      totalRounds: rounds.length,
      rounds: summary,
      // Collect all non-empty debug/stderr messages for quick scanning
      debugHighlights: summary
        .filter((r) => r.judgeDebug || r.bot0Debug || r.bot0Stderr || r.bot1Debug || r.bot1Stderr)
        .map((r) => ({
          round: r.round,
          ...(r.judgeDebug ? { judgeDebug: r.judgeDebug } : {}),
          ...(r.bot0Debug ? { bot0Debug: r.bot0Debug } : {}),
          ...(r.bot0Stderr ? { bot0Stderr: r.bot0Stderr } : {}),
          ...(r.bot1Debug ? { bot1Debug: r.bot1Debug } : {}),
          ...(r.bot1Stderr ? { bot1Stderr: r.bot1Stderr } : {}),
        })),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[leverage-mcp] Server started on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[leverage-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
