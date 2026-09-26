import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';

/** Public turn data only; promises, timers and SSE connections never leave the process. */
export interface PendingTurn {
  matchId: number;
  gamerId: number;
  ownerUserId: number;
  turnToken: string;
  gameState: unknown;
}

type Event =
  | {
      type: 'your-turn';
      matchId: number;
      ownerUserId: number;
      gamerId: number;
      turnToken: string;
      gameState: unknown;
    }
  | { type: 'changed'; turnToken: string }
  | { type: 'game-over'; matchId: number; finalResult: Record<string, number> };

const CHANNEL = 'human-turn:v1:events';
const slot = (matchId: number, gamerId: number) =>
  `human-turn:v1:slot:${matchId}:${gamerId}`;
const tokenKey = (token: string) => `human-turn:v1:token:${token}`;
const responseKey = (token: string) => `human-turn:v1:response:${token}`;
const gamerKey = (gamerId: number) => `human-turn:v1:gamer:${gamerId}`;
const matchKey = (matchId: number) => `human-turn:v1:match:${matchId}`;
const overKey = (matchId: number) => `human-turn:v1:over:${matchId}`;

// All transitions compare the current slot token. A delayed timeout or stale reply
// cannot delete a replacement turn. Token index is only a lookup, not authority.
const CREATE = `
if redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
local old = redis.call('GET', KEYS[1])
if old then redis.call('DEL', 'human-turn:v1:token:' .. cjson.decode(old).turnToken) end
redis.call('PSETEX', KEYS[1], ARGV[2], ARGV[1])
redis.call('PSETEX', KEYS[2], ARGV[2], KEYS[1])
redis.call('PSETEX', KEYS[3], ARGV[2], KEYS[1])
redis.call('SADD', KEYS[5], KEYS[1])
redis.call('PEXPIRE', KEYS[5], ARGV[2] + 60000)
redis.call('PUBLISH', ARGV[3], ARGV[4])
return 1`;
const SUBMIT = `
local s = redis.call('GET', KEYS[1])
if not s then return 0 end
local v = redis.call('GET', s)
if not v then return 0 end
local t = cjson.decode(v)
if t.turnToken ~= ARGV[1] then return 0 end
if ARGV[2] ~= '' and tostring(t.ownerUserId) ~= ARGV[2] then return 0 end
if ARGV[3] ~= '' and tostring(t.gamerId) ~= ARGV[3] then return 0 end
redis.call('PSETEX', KEYS[2], 60000, ARGV[4])
redis.call('DEL', KEYS[1], s)
if redis.call('GET', 'human-turn:v1:gamer:' .. t.gamerId) == s then redis.call('DEL', 'human-turn:v1:gamer:' .. t.gamerId) end
redis.call('SREM', 'human-turn:v1:match:' .. t.matchId, s)
redis.call('PUBLISH', ARGV[5], ARGV[6])
return 1`;
const REMOVE = `
local v = redis.call('GET', KEYS[1])
if not v or cjson.decode(v).turnToken ~= ARGV[1] then return 0 end
local t = cjson.decode(v)
redis.call('DEL', KEYS[1], 'human-turn:v1:token:' .. ARGV[1])
if redis.call('GET', 'human-turn:v1:gamer:' .. t.gamerId) == KEYS[1] then redis.call('DEL', 'human-turn:v1:gamer:' .. t.gamerId) end
redis.call('SREM', 'human-turn:v1:match:' .. t.matchId, KEYS[1])
redis.call('PUBLISH', ARGV[2], ARGV[3])
return 1`;
const GAME_OVER = `
redis.call('PSETEX', KEYS[1], 3600000, ARGV[1])
local slots = redis.call('SMEMBERS', KEYS[2])
for _, s in ipairs(slots) do
 local v = redis.call('GET', s)
 if v then
  local t = cjson.decode(v)
  if tostring(t.matchId) == ARGV[2] then
   redis.call('DEL', s, 'human-turn:v1:token:' .. t.turnToken)
   if redis.call('GET', 'human-turn:v1:gamer:' .. t.gamerId) == s then redis.call('DEL', 'human-turn:v1:gamer:' .. t.gamerId) end
  end
 end
end
redis.call('DEL', KEYS[2])
redis.call('PUBLISH', ARGV[3], ARGV[4])
return 1`;

@Injectable()
export class HumanTurnService implements OnModuleDestroy {
  private readonly logger = new Logger(HumanTurnService.name);
  private readonly redis: IORedis;
  private readonly subscriber: IORedis;
  private subscription?: Promise<void>;
  private readonly waits = new Map<
    string,
    { slot: string; wake: () => void; reject: (error: Error) => void }
  >();
  private readonly sseClients = new Map<
    string,
    {
      matchId: number;
      userId: number;
      writer: (data: string) => void;
      lastToken?: string;
    }
  >();
  private readonly turnWaiters = new Map<number, Set<() => void>>();
  private closed = false;

  constructor(config: ConfigService) {
    const options = {
      host: config.get<string>('redis.host', 'localhost'),
      port: config.get<number>('redis.port', 6379),
      password: config.get<string>('redis.password') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (n: number) => Math.min(n * 100, 1000),
    };
    this.redis = new IORedis(options);
    this.subscriber = new IORedis(options);
    this.redis.on('error', (e) =>
      this.logger.warn(`human turn Redis: ${e.message}`),
    );
    this.subscriber.on('error', (e) =>
      this.logger.warn(`human turn subscriber: ${e.message}`),
    );
    this.subscriber.on('message', (channel, data) => {
      if (channel !== CHANNEL) return;
      try {
        this.onEvent(JSON.parse(data) as Event);
      } catch (e) {
        this.logger.warn(`human turn event invalid: ${String(e)}`);
      }
    });
  }

  private async ready(): Promise<void> {
    if (this.closed) throw new Error('human turn service closed');
    if (!this.subscription) {
      this.subscription = (async () => {
        if (this.redis.status === 'wait') await this.redis.connect();
        if (this.subscriber.status === 'wait') await this.subscriber.connect();
        await this.subscriber.subscribe(CHANNEL);
      })().catch((e) => {
        this.subscription = undefined;
        throw e;
      });
    }
    await this.subscription;
  }

  private onEvent(event: Event): void {
    if (event.type === 'changed') {
      this.waits.get(event.turnToken)?.wake();
      return;
    }
    if (event.type === 'your-turn') {
      for (const client of this.sseClients.values()) {
        if (
          client.matchId === event.matchId &&
          client.userId === event.ownerUserId
        ) {
          this.send(client, {
            type: 'your-turn',
            turnToken: event.turnToken,
            gamerId: event.gamerId,
            gameState: event.gameState,
          });
        }
      }
      for (const wake of this.turnWaiters.get(event.gamerId) ?? []) wake();
      return;
    }
    for (const client of this.sseClients.values()) {
      if (client.matchId === event.matchId)
        this.send(client, {
          type: 'game-over',
          finalResult: event.finalResult,
        });
    }
    for (const wakeSet of this.turnWaiters.values())
      for (const wake of wakeSet) wake();
    for (const wait of this.waits.values()) wait.wake();
  }

  private send(
    client: { writer: (data: string) => void; lastToken?: string },
    payload: { type: string; turnToken?: string; [key: string]: unknown },
  ): void {
    if (payload.turnToken && client.lastToken === payload.turnToken) return;
    try {
      client.writer(JSON.stringify(payload));
      client.lastToken = payload.turnToken;
    } catch {
      for (const [id, value] of this.sseClients)
        if (value === client) this.sseClients.delete(id);
    }
  }

  async waitForResponse(
    matchId: number,
    gamerId: number,
    gameState: unknown,
    timeoutMs = 300_000,
    ownerUserId?: number,
    signal?: AbortSignal,
  ): Promise<string> {
    if (ownerUserId === undefined) throw new Error('human turn owner required');
    await this.ready();
    if (signal?.aborted) throw new Error('human turn aborted');
    const turnToken = randomUUID();
    const key = slot(matchId, gamerId);
    const turn: PendingTurn = {
      matchId,
      gamerId,
      ownerUserId,
      turnToken,
      gameState,
    };
    const event: Event = { type: 'your-turn', ...turn };
    const ttl = Math.max(1, timeoutMs);
    const created = await this.redis.eval(
      CREATE,
      5,
      key,
      tokenKey(turnToken),
      gamerKey(gamerId),
      overKey(matchId),
      matchKey(matchId),
      JSON.stringify(turn),
      String(ttl),
      CHANNEL,
      JSON.stringify(event),
    );
    if (created !== 1) throw new Error('match already finished');
    return new Promise<string>((resolve, reject) => {
      let finished = false;
      let busy = false;
      const end = (value?: string, error?: Error) => {
        if (finished) return;
        finished = true;
        clearInterval(interval);
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        this.waits.delete(turnToken);
        if (error) reject(error);
        else resolve(value ?? '');
      };
      const check = async () => {
        if (busy || finished) return;
        busy = true;
        try {
          const response = await this.redis.getdel(responseKey(turnToken));
          if (response !== null) return void end(response);
          const current = await this.redis.get(key);
          if (!current) {
            // Redis may expire the slot slightly before the local timeout fires.
            // A missing slot alone is not proof of cancellation.
            if (await this.redis.exists(overKey(matchId))) {
              return void end(undefined, new Error('human turn cancelled'));
            }
            return;
          }
          if ((JSON.parse(current) as PendingTurn).turnToken !== turnToken)
            return void end(
              undefined,
              new Error('human turn cancelled or superseded'),
            );
        } catch (e) {
          this.logger.warn(`human turn check failed: ${String(e)}`);
        } finally {
          busy = false;
        }
      };
      const abort = () => {
        void this.remove(key, turnToken)
          .catch((e) =>
            this.logger.warn(`human turn abort cleanup failed: ${String(e)}`),
          )
          .finally(() => void end(undefined, new Error('human turn aborted')));
      };
      const timer = setTimeout(() => {
        void (async () => {
          try {
            const response = await this.redis.getdel(responseKey(turnToken));
            if (response !== null) return void end(response);
            await this.remove(key, turnToken);
          } catch (e) {
            this.logger.warn(`human turn timeout cleanup failed: ${String(e)}`);
            return void end(
              undefined,
              new Error('human turn Redis unavailable at timeout'),
            );
          }
          void end('');
        })();
      }, ttl);
      const interval = setInterval(() => void check(), 250);
      this.waits.set(turnToken, {
        slot: key,
        wake: () => void check(),
        reject: (error) => void end(undefined, error),
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      void check();
    });
  }

  private async remove(key: string, token: string): Promise<void> {
    await this.redis.eval(
      REMOVE,
      1,
      key,
      token,
      CHANNEL,
      JSON.stringify({ type: 'changed', turnToken: token }),
    );
  }

  async submitResponse(
    turnToken: string,
    response: string,
    userId?: number,
    gamerId?: number,
  ): Promise<boolean> {
    if (
      (userId === undefined && gamerId === undefined) ||
      typeof turnToken !== 'string' ||
      !turnToken ||
      typeof response !== 'string'
    )
      return false;
    await this.ready();
    return (
      (await this.redis.eval(
        SUBMIT,
        2,
        tokenKey(turnToken),
        responseKey(turnToken),
        turnToken,
        userId === undefined ? '' : String(userId),
        gamerId === undefined ? '' : String(gamerId),
        response,
        CHANNEL,
        JSON.stringify({ type: 'changed', turnToken }),
      )) === 1
    );
  }

  async getPendingTurn(gamerId: number): Promise<PendingTurn | undefined> {
    await this.ready();
    const key = await this.redis.get(gamerKey(gamerId));
    const raw = key ? await this.redis.get(key) : null;
    const turn = raw ? (JSON.parse(raw) as PendingTurn) : undefined;
    return turn?.gamerId === gamerId ? turn : undefined;
  }

  async waitForTurn(
    gamerId: number,
    timeoutMs = 30_000,
  ): Promise<PendingTurn | null> {
    await this.ready(); // subscribe before reading to close the subscribe/read race
    const existing = await this.getPendingTurn(gamerId);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      let done = false;
      let busy = false;
      const finish = (turn: PendingTurn | null, error?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(interval);
        this.turnWaiters.get(gamerId)?.delete(wake);
        if (error) reject(error);
        else resolve(turn);
      };
      const wake = () => {
        if (done || busy) return;
        busy = true;
        void this.getPendingTurn(gamerId)
          .then((turn) => {
            if (turn) finish(turn);
          })
          .catch((e) => finish(null, e))
          .finally(() => {
            busy = false;
          });
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      const interval = setInterval(wake, 250); // also recovers from lost Pub/Sub events
      if (!this.turnWaiters.has(gamerId))
        this.turnWaiters.set(gamerId, new Set());
      this.turnWaiters.get(gamerId)!.add(wake);
      wake();
    });
  }

  async notifyGameOver(
    matchId: number,
    finalResult: Record<string, number>,
  ): Promise<void> {
    await this.ready();
    await this.redis.eval(
      GAME_OVER,
      2,
      overKey(matchId),
      matchKey(matchId),
      JSON.stringify(finalResult),
      String(matchId),
      CHANNEL,
      JSON.stringify({ type: 'game-over', matchId, finalResult }),
    );
  }

  registerSSEClient(
    matchId: number,
    userId: number,
    writer: (data: string) => void,
  ): string {
    const id = randomUUID();
    this.sseClients.set(id, { matchId, userId, writer });
    return id;
  }

  async replayPendingTurn(
    matchId: number,
    userId: number,
    writer: (data: string) => void,
  ): Promise<void> {
    await this.ready();
    const client = [...this.sseClients.values()].find(
      (c) =>
        c.matchId === matchId && c.userId === userId && c.writer === writer,
    );
    if (!client) return;
    const final = await this.redis.get(overKey(matchId));
    if (final) {
      this.send(client, { type: 'game-over', finalResult: JSON.parse(final) });
      return;
    }
    const keys = await this.redis.smembers(matchKey(matchId));
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      const turn = JSON.parse(raw) as PendingTurn;
      if (turn.matchId === matchId && turn.ownerUserId === userId) {
        // Game-over may have raced the read; do not replay an obsolete token.
        if (await this.redis.get(overKey(matchId))) return;
        this.send(client, {
          type: 'your-turn',
          turnToken: turn.turnToken,
          gamerId: turn.gamerId,
          gameState: turn.gameState,
        });
      }
    }
  }

  unregisterSSEClient(id: string): void {
    this.sseClients.delete(id);
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    const owned = [...this.waits.entries()];
    for (const [, wait] of owned)
      wait.reject(new Error('human turn service stopped'));
    for (const [token, wait] of owned) {
      try {
        await this.remove(wait.slot, token);
      } catch (e) {
        this.logger.warn(`human turn shutdown cleanup failed: ${String(e)}`);
      }
    }
    this.sseClients.clear();
    await Promise.all([
      this.subscriber.quit().catch(() => this.subscriber.disconnect()),
      this.redis.quit().catch(() => this.redis.disconnect()),
    ]);
  }
}
