import { AutoMatchSchedulerService } from './auto-match-scheduler.service';
import { LeaseService } from '../redis/lease.service';
import { RedisService } from '../redis/redis.service';

describe('AutoMatchSchedulerService coordination', () => {
  const data = new Map<string, string>();
  let owner: string | null;
  let lease: Pick<LeaseService, 'acquire' | 'renew' | 'release' | 'setIfOwned'>;
  let games: { find: jest.Mock };
  let gamers: { find: jest.Mock };
  let compete: { triggerAutoMatch: jest.Mock };
  let redis: Pick<RedisService, 'get' | 'del'>;
  let a: AutoMatchSchedulerService;
  let b: AutoMatchSchedulerService;

  beforeEach(() => {
    data.clear();
    owner = null;
    let serial = 0;
    lease = {
      acquire: jest.fn(() => {
        if (owner) return Promise.resolve(null);
        owner = `owner-${++serial}`;
        return Promise.resolve(owner);
      }),
      renew: jest.fn((_key, token) => Promise.resolve(owner === token)),
      release: jest.fn((_key, token) => {
        if (owner !== token) return Promise.resolve(false);
        owner = null;
        return Promise.resolve(true);
      }),
      setIfOwned: jest.fn((_key, token, stateKey, value) => {
        if (owner !== token) return Promise.resolve(false);
        data.set(stateKey, value);
        return Promise.resolve(true);
      }),
    };
    games = { find: jest.fn().mockResolvedValue([{ id: 7 }]) };
    gamers = { find: jest.fn().mockResolvedValue([]) };
    compete = { triggerAutoMatch: jest.fn().mockResolvedValue({ created: 1 }) };
    redis = {
      get: jest.fn((key: string) => Promise.resolve(data.get(key) ?? null)),
      del: jest.fn((key: string) => Promise.resolve(Number(data.delete(key)))),
    };
    const make = () =>
      new AutoMatchSchedulerService(
        games as never,
        gamers as never,
        compete as never,
        lease as LeaseService,
        redis as RedisService,
      );
    a = make();
    b = make();
  });

  it('does not overlap or replay the same due window after the winner releases', async () => {
    let finish!: (value: { created: number }) => void;
    compete.triggerAutoMatch.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const first = a.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await b.tick();
    expect(compete.triggerAutoMatch).toHaveBeenCalledTimes(1);
    finish({ created: 1 });
    await first;
    await b.tick();
    expect(compete.triggerAutoMatch).toHaveBeenCalledTimes(1);
    expect(owner).toBeNull();
  });

  it('does not publish stale state if ownership is lost while matching', async () => {
    compete.triggerAutoMatch.mockImplementation(() => {
      owner = 'replacement';
      return Promise.resolve({ created: 1 });
    });
    await a.tick();
    expect(data.size).toBe(0);
    expect(owner).toBe('replacement');
  });

  it('shares adaptive backoff between instances', async () => {
    let now = 1_000_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await a.tick();
      now += 60_000;
      await b.tick();
      now += 60_000;
      await a.tick(); // third stable snapshot doubles interval
      expect(compete.triggerAutoMatch).toHaveBeenCalledTimes(3);
      now += 60_000;
      await b.tick();
      expect(compete.triggerAutoMatch).toHaveBeenCalledTimes(3);
      now += 60_000;
      await b.tick();
      expect(compete.triggerAutoMatch).toHaveBeenCalledTimes(4);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not schedule maintenance on worker-only instances', async () => {
    const previous = process.env.BACKEND_ROLE;
    process.env.BACKEND_ROLE = 'worker';
    try {
      await a.tick();
      expect(games.find).not.toHaveBeenCalled();
      expect(lease.acquire).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.BACKEND_ROLE;
      else process.env.BACKEND_ROLE = previous;
    }
  });
});
