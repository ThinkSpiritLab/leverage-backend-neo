import { LeaseService } from './lease.service';

describe('LeaseService', () => {
  const entries = new Map<string, string>();
  const client = {
    set: jest.fn(
      (key: string, value: string, px: string, ttl: number, nx: string) => {
        expect([px, nx]).toEqual(['PX', 'NX']);
        expect(ttl).toBeGreaterThan(0);
        if (entries.has(key)) return Promise.resolve(null);
        entries.set(key, value);
        return Promise.resolve('OK');
      },
    ),
    eval: jest.fn(
      (_script: string, count: number, ...args: Array<string | number>) => {
        const key = String(args[0]);
        const token = String(args[count === 2 ? 2 : 1]);
        if (entries.get(key) !== token) return Promise.resolve(0);
        if (count === 2) {
          entries.set(String(args[1]), String(args[3]));
        } else if (_script.includes("'DEL'")) {
          entries.delete(key);
        }
        return Promise.resolve(1);
      },
    ),
  };
  const service = new LeaseService({ getClient: () => client } as never);

  beforeEach(() => {
    entries.clear();
    jest.clearAllMocks();
  });

  it('rejects a second owner, and stale release and writes cannot affect its successor', async () => {
    const old = await service.acquire('lease', 1000);
    expect(old).toBeTruthy();
    expect(await service.acquire('lease', 1000)).toBeNull();
    entries.delete('lease'); // Redis TTL expiry
    const next = await service.acquire('lease', 1000);
    expect(next).not.toBe(old);
    expect(await service.release('lease', old!)).toBe(false);
    expect(await service.renew('lease', old!, 1000)).toBe(false);
    expect(await service.setIfOwned('lease', old!, 'state', 'stale')).toBe(
      false,
    );
    expect(entries.get('lease')).toBe(next);
    expect(await service.setIfOwned('lease', next!, 'state', 'fresh')).toBe(
      true,
    );
    expect(entries.get('state')).toBe('fresh');
    expect(await service.release('lease', next!)).toBe(true);
  });
});
