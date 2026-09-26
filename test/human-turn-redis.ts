/* Run against an EXCLUSIVE disposable Redis: REDIS_HOST=127.0.0.1 REDIS_PORT=... pnpm exec ts-node --transpile-only test/human-turn-redis.ts */
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { HumanTurnService } from '../src/modules/compete/human-turn.service';

async function main(): Promise<void> {
  const host = process.env.REDIS_HOST ?? '127.0.0.1';
  const port = Number(process.env.REDIS_PORT);
  if (!port || host !== '127.0.0.1')
    throw new Error('Use a disposable loopback Redis and set REDIS_PORT');
  const config = {
    get: (key: string) => (key === 'redis.host' ? host : port),
  } as ConfigService;
  const a = new HumanTurnService(config);
  const b = new HumanTurnService(config);
  const redis = new IORedis({ host, port });
  const base = randomInt(1000000, 2000000000);
  const match = base;
  const gamer = base + 1;
  const owner = base + 2;
  const other = base + 3;
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const until = async <T>(
    fn: () => Promise<T | undefined> | T | undefined,
  ): Promise<T> => {
    for (let i = 0; i < 60; i++) {
      const result = await fn();
      if (result) return result;
      await sleep(20);
    }
    throw new Error('turn not visible across instances');
  };
  const events: string[] = [];
  const second: string[] = [];
  const forbidden: string[] = [];
  let connection = '';
  try {
    connection = b.registerSSEClient(match, owner, (value) =>
      events.push(value),
    );
    b.registerSSEClient(match, owner, (value) => second.push(value));
    b.registerSSEClient(match, other, (value) => forbidden.push(value));
    // Ensure B subscribed before A publishes.
    await b.getPendingTurn(gamer);
    const waiting = a.waitForResponse(match, gamer, { state: 1 }, 2500, owner);
    const turn = await until(() => b.getPendingTurn(gamer));
    assert.equal(turn.ownerUserId, owner);
    await until(() => (events.length && second.length ? true : undefined));
    assert.equal(forbidden.length, 0);
    assert.equal((await b.waitForTurn(gamer, 100))?.turnToken, turn.turnToken);
    assert.equal(await b.submitResponse(turn.turnToken, 'wrong', other), false);
    assert.equal(
      await b.submitResponse(turn.turnToken, 'wrong', undefined, other),
      false,
    );
    assert.equal(await b.submitResponse('old-token', 'wrong', owner), false);
    assert.deepEqual(
      await Promise.all(
        Array.from({ length: 8 }, () =>
          b.submitResponse(turn.turnToken, 'move', owner),
        ),
      ),
      [true, false, false, false, false, false, false, false],
    );
    assert.equal(await waiting, 'move');
    assert.equal(await b.getPendingTurn(gamer), undefined);
    assert.equal(
      await b.submitResponse(turn.turnToken, 'duplicate', owner),
      false,
    );

    // Replacement must invalidate old tokens without deleting the new turn.
    const oldWait = a.waitForResponse(match, gamer, {}, 2000, owner);
    const oldRejected = assert.rejects(oldWait, /superseded|cancelled/);
    const old = await until(() => b.getPendingTurn(gamer));
    const newWait = a.waitForResponse(match, gamer, { state: 2 }, 2000, owner);
    const current = await until(async () => {
      const t = await b.getPendingTurn(gamer);
      return t?.turnToken !== old.turnToken ? t : undefined;
    });
    await oldRejected;
    assert.equal(await b.submitResponse(old.turnToken, 'old', owner), false);
    assert.equal((await b.getPendingTurn(gamer))?.turnToken, current.turnToken);
    assert.equal(
      await b.submitResponse(current.turnToken, 'new', undefined, gamer),
      true,
    );
    assert.equal(await newWait, 'new');

    b.unregisterSSEClient(connection);
    const timeoutWait = a.waitForResponse(
      match + 10,
      gamer + 10,
      {},
      120,
      owner,
    );
    const timed = await until(() => b.getPendingTurn(gamer + 10));
    assert.equal(await timeoutWait, '');
    assert.equal(await b.submitResponse(timed.turnToken, 'late', owner), false);

    const overWait = a.waitForResponse(match + 20, gamer + 20, {}, 2500, owner);
    const overRejected = assert.rejects(overWait, /cancelled|superseded/);
    const overTurn = await until(() => b.getPendingTurn(gamer + 20));
    const terminalEvents: string[] = [];
    b.registerSSEClient(match + 20, owner, (value) =>
      terminalEvents.push(value),
    );
    await b.notifyGameOver(match + 20, { [gamer + 20]: 1 });
    await overRejected;
    assert.equal(await b.getPendingTurn(gamer + 20), undefined);
    assert.equal(
      await b.submitResponse(overTurn.turnToken, 'late', owner),
      false,
    );
    const replay: string[] = [];
    const replayWriter = (value: string) => replay.push(value);
    b.registerSSEClient(match + 20, owner, replayWriter);
    await b.replayPendingTurn(match + 20, owner, replayWriter);
    assert.equal(JSON.parse(replay[0]).type, 'game-over');
    assert.equal(forbidden.length, 0);
    assert.ok(terminalEvents.length > 0 || replay.length > 0);
    const survivesApiStop = a.waitForResponse(
      match + 30,
      gamer + 30,
      {},
      2000,
      owner,
    );
    await until(() => b.getPendingTurn(gamer + 30));
    await b.onModuleDestroy();
    const c = new HumanTurnService(config);
    const afterRestart = await c.getPendingTurn(gamer + 30);
    assert.ok(afterRestart);
    assert.equal(
      await c.submitResponse(afterRestart.turnToken, 'survived', owner),
      true,
    );
    assert.equal(await survivesApiStop, 'survived');
    await c.onModuleDestroy();
    console.log(
      'PASS real Redis: cross-instance auth/reply, timeout, game-over, SSE, API restart',
    );
  } finally {
    await a.onModuleDestroy();
    if (!(b as any).stopped) await b.onModuleDestroy();
    const keys = await redis.keys('human-turn:v1:*');
    // Exclusive container: never run this script against a shared Redis.
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
