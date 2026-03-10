import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface PendingTurn {
  matchId: number;
  gamerId: number;
  turnToken: string;
  gameState: unknown;
  resolve: (response: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  /** SSE writer for browser human players */
  sseWriter?: (data: string) => void;
}

/**
 * HumanTurnService
 *
 * Manages the "waiting pool" for human / external bot turns.
 *
 * Flow:
 *  1. botzone-neo calls POST /compete/human-turn-webhook/:matchId/:gamerId
 *     → createPendingTurn() registers the turn and holds the request open.
 *     → SSE / long-poll consumers are notified.
 *  2. Browser or external bot calls POST /compete/bot-respond { turnToken, response }
 *     → submitResponse() resolves the waiting request.
 *  3. botzone-neo receives the response and continues the game.
 */
@Injectable()
export class HumanTurnService {
  private readonly logger = new Logger(HumanTurnService.name);

  /** matchId:gamerId → pending turn */
  private readonly pending = new Map<string, PendingTurn>();

  /** SSE writers keyed by matchId:userId */
  private readonly sseClients = new Map<string, (data: string) => void>();

  private key(matchId: number, gamerId: number) {
    return `${matchId}:${gamerId}`;
  }

  /** Called by botzone-neo webhook; resolves when human responds or times out */
  waitForResponse(
    matchId: number,
    gamerId: number,
    gameState: unknown,
    timeoutMs = 300_000,
  ): Promise<string> {
    const k = this.key(matchId, gamerId);
    // Cancel any stale pending turn for this slot
    this.cancelPending(k);

    const turnToken = randomUUID();

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(k);
        this.logger.warn(`human turn timeout: matchId=${matchId} gamerId=${gamerId}`);
        resolve(''); // empty = forfeit / pass
      }, timeoutMs);

      const entry: PendingTurn = {
        matchId, gamerId, turnToken, gameState,
        resolve: (r) => { clearTimeout(timer); this.pending.delete(k); resolve(r); },
        reject: (e) => { clearTimeout(timer); this.pending.delete(k); reject(e); },
        timer,
      };
      this.pending.set(k, entry);

      // Notify SSE clients watching this match
      this.notifySSE(matchId, { type: 'your-turn', turnToken, gamerId, gameState });
    });
  }

  /** Browser / external bot submits their response */
  submitResponse(turnToken: string, response: string): boolean {
    for (const [, entry] of this.pending) {
      if (entry.turnToken === turnToken) {
        entry.resolve(response);
        return true;
      }
    }
    return false;
  }

  /** Get pending turn info for long-poll (external bots) */
  getPendingTurn(gamerId: number): PendingTurn | undefined {
    for (const [, entry] of this.pending) {
      if (entry.gamerId === gamerId) return entry;
    }
    return undefined;
  }

  /** Wait until a turn is ready for this gamerId (long-poll for external bots) */
  waitForTurn(gamerId: number, timeoutMs = 30_000): Promise<PendingTurn | null> {
    // Check if already pending
    const existing = this.getPendingTurn(gamerId);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.turnWaiters.delete(gamerId);
        resolve(null);
      }, timeoutMs);

      this.turnWaiters.set(gamerId, (turn) => {
        clearTimeout(timer);
        resolve(turn);
      });
    });
  }

  /** Notify waiting long-poll clients when a turn becomes available */
  private readonly turnWaiters = new Map<number, (turn: PendingTurn) => void>();

  private notifySSE(matchId: number, payload: unknown) {
    const data = JSON.stringify(payload);

    // Notify SSE browser clients watching this match
    for (const [key, writer] of this.sseClients) {
      if (key.startsWith(`${matchId}:`)) {
        try { writer(data); } catch { this.sseClients.delete(key); }
      }
    }

    // Notify long-poll bot waiters
    if (typeof (payload as any).gamerId === 'number') {
      const gamerId = (payload as any).gamerId as number;
      const waiter = this.turnWaiters.get(gamerId);
      if (waiter) {
        this.turnWaiters.delete(gamerId);
        const pending = this.getPendingTurn(gamerId);
        if (pending) waiter(pending);
      }
    }
  }

  /** Register an SSE browser client */
  registerSSEClient(matchId: number, userId: number, writer: (data: string) => void) {
    const k = `${matchId}:${userId}`;
    this.sseClients.set(k, writer);
    this.logger.log(`SSE client registered: matchId=${matchId} userId=${userId}`);
  }

  /**
   * If there's already a pending turn for this match (e.g. SSE client connected late),
   * immediately push it to the just-connected client so they don't miss their turn.
   */
  replayPendingTurn(matchId: number, writer: (data: string) => void) {
    for (const [, entry] of this.pending) {
      if (entry.matchId === matchId) {
        const payload = JSON.stringify({
          type: 'your-turn',
          turnToken: entry.turnToken,
          gamerId: entry.gamerId,
          gameState: entry.gameState,
        });
        try { writer(payload); } catch { /* ignore */ }
        return;
      }
    }
  }

  unregisterSSEClient(matchId: number, userId: number) {
    this.sseClients.delete(`${matchId}:${userId}`);
  }

  private cancelPending(key: string) {
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reject(new Error('superseded by new turn'));
      this.pending.delete(key);
    }
  }
}
