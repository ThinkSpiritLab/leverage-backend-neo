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
    // The match result has a verdict field; if it's finish/error/forfeit we're done
    const verdict = result.verdict as string | undefined;
    if (verdict && verdict !== 'continue' && verdict !== 'running' && verdict !== 'pending') {
      return result;
    }
    // Also check if status indicates completion
    const status = result.status as string | undefined;
    if (status && status !== 'running' && status !== 'pending') {
      return result;
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
