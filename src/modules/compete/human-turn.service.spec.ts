import { ConfigService } from '@nestjs/config';
import { HumanTurnService } from './human-turn.service';

describe('HumanTurnService authorization and SSE connections', () => {
  let service: HumanTurnService;
  let response: string | null;
  let token: string;

  beforeEach(() => {
    service = new HumanTurnService({
      get: (_: string, fallback: unknown) => fallback,
    } as ConfigService);
    response = null;
    token = '';
    // Unit boundary: Redis Lua authorization/atomicity is tested separately against
    // an actual Redis server in test/human-turn-redis.ts.
    jest.spyOn(service as any, 'ready').mockResolvedValue(undefined);
    const redis = (service as any).redis;
    jest
      .spyOn(redis, 'eval')
      .mockImplementation(
        (script: string, _keys: number, ...args: string[]) => {
          if (script.includes('PSETEX') && script.includes('SADD')) {
            token = JSON.parse(args[5]).turnToken;
            (service as any).onEvent(JSON.parse(args[8]));
            return Promise.resolve(1);
          }
          if (script.includes('PSETEX') && script.includes('ARGV[4]')) {
            if (
              args[2] !== token ||
              (args[3] && args[3] !== '11') ||
              (args[4] && args[4] !== '31') ||
              response !== null
            )
              return Promise.resolve(0);
            response = args[5];
            (service as any).onEvent(JSON.parse(args[7]));
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        },
      );
    jest.spyOn(redis, 'getdel').mockImplementation(() => {
      const result = response;
      response = null;
      return Promise.resolve(result);
    });
    jest
      .spyOn(redis, 'get')
      .mockImplementation(() =>
        Promise.resolve(JSON.stringify({ turnToken: token })),
      );
  });

  afterEach(() => {
    (service as any).subscriber.disconnect();
    (service as any).redis.disconnect();
  });

  it('uses the configured Redis password for both pub/sub sockets', () => {
    const password = 'fixture-only';
    const configured = new HumanTurnService({
      get: (key: string, fallback?: unknown) => key === 'redis.password' ? password : fallback,
    } as ConfigService);
    try {
      expect((configured as any).redis.options.password).toBe(password);
      expect((configured as any).subscriber.options.password).toBe(password);
    } finally {
      (configured as any).subscriber.disconnect();
      (configured as any).redis.disconnect();
    }
  });

  it('delivers a turn only to its owner and allows same-owner connections', async () => {
    const ownerA: string[] = [];
    const ownerB: string[] = [];
    const ownerA2: string[] = [];
    service.registerSSEClient(8, 11, (data) => ownerA.push(data));
    service.registerSSEClient(8, 22, (data) => ownerB.push(data));
    service.registerSSEClient(8, 11, (data) => ownerA2.push(data));

    const pending = service.waitForResponse(8, 31, { state: 1 }, 10_000, 11);
    await new Promise((resolve) => setImmediate(resolve));
    expect(ownerA).toHaveLength(1);
    expect(ownerA2).toHaveLength(1);
    expect(ownerB).toHaveLength(0);
    const turnToken = JSON.parse(ownerA[0]).turnToken;
    expect(await service.submitResponse(turnToken, 'move', 22)).toBe(false);
    expect(await service.submitResponse(turnToken, 'move', 11)).toBe(true);
    await expect(pending).resolves.toBe('move');
  });

  it('removes only the closed SSE connection', () => {
    const a: string[] = [];
    const b: string[] = [];
    const connectionA = service.registerSSEClient(8, 11, (data) =>
      a.push(data),
    );
    service.registerSSEClient(8, 11, (data) => b.push(data));
    service.unregisterSSEClient(connectionA);
    (service as any).onEvent({
      type: 'game-over',
      matchId: 8,
      finalResult: { '31': 1 },
    });
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });
});
