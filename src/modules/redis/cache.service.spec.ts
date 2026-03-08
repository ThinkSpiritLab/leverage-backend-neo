import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

// ─── Mock RedisService ────────────────────────────────────────────────────────

const mockRedisService = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CacheService', () => {
  let service: CacheService;
  let redis: ReturnType<typeof mockRedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: RedisService, useFactory: mockRedisService },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    redis = module.get(RedisService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── get ───────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('缓存命中：返回反序列化的值', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ name: 'Alice', age: 30 }));

      const result = await service.get<{ name: string; age: number }>('user:1');

      expect(result).toEqual({ name: 'Alice', age: 30 });
      expect(redis.get).toHaveBeenCalledWith('user:1');
    });

    it('缓存命中：返回数字', async () => {
      redis.get.mockResolvedValue('42');

      const result = await service.get<number>('count');

      expect(result).toBe(42);
    });

    it('缓存命中：返回数组', async () => {
      redis.get.mockResolvedValue(JSON.stringify([1, 2, 3]));

      const result = await service.get<number[]>('list');

      expect(result).toEqual([1, 2, 3]);
    });

    it('缓存未命中：返回 null', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.get('missing');

      expect(result).toBeNull();
    });

    it('JSON 解析失败时返回原始字符串', async () => {
      redis.get.mockResolvedValue('not-json-{invalid}');

      const result = await service.get('bad-json');

      expect(result).toBe('not-json-{invalid}');
    });

    it('缓存命中：返回布尔值', async () => {
      redis.get.mockResolvedValue('true');

      const result = await service.get<boolean>('flag');

      expect(result).toBe(true);
    });
  });

  // ─── set ───────────────────────────────────────────────────────────────────

  describe('set', () => {
    it('设置对象缓存（JSON 序列化）', async () => {
      redis.set.mockResolvedValue(undefined);

      await service.set('user:1', { name: 'Alice', age: 30 });

      expect(redis.set).toHaveBeenCalledWith(
        'user:1',
        JSON.stringify({ name: 'Alice', age: 30 }),
        undefined,
      );
    });

    it('设置缓存带 TTL', async () => {
      redis.set.mockResolvedValue(undefined);

      await service.set('session', { token: 'abc' }, 3600);

      expect(redis.set).toHaveBeenCalledWith(
        'session',
        JSON.stringify({ token: 'abc' }),
        3600,
      );
    });

    it('设置字符串值', async () => {
      redis.set.mockResolvedValue(undefined);

      await service.set('greeting', 'hello');

      expect(redis.set).toHaveBeenCalledWith('greeting', '"hello"', undefined);
    });

    it('设置数组', async () => {
      redis.set.mockResolvedValue(undefined);

      await service.set('ids', [1, 2, 3]);

      expect(redis.set).toHaveBeenCalledWith('ids', '[1,2,3]', undefined);
    });
  });

  // ─── del ───────────────────────────────────────────────────────────────────

  describe('del', () => {
    it('删除单个缓存 key', async () => {
      redis.del.mockResolvedValue(1);

      await service.del('user:1');

      expect(redis.del).toHaveBeenCalledWith('user:1');
    });

    it('删除多个缓存 key', async () => {
      redis.del.mockResolvedValue(2);

      await service.del('user:1', 'user:2');

      expect(redis.del).toHaveBeenCalledWith('user:1', 'user:2');
    });
  });

  // ─── getOrSet ──────────────────────────────────────────────────────────────

  describe('getOrSet', () => {
    it('缓存命中时直接返回，不调用 factory', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ id: 1, name: 'Cached' }));
      const factory = jest.fn();

      const result = await service.getOrSet('user:1', factory);

      expect(result).toEqual({ id: 1, name: 'Cached' });
      expect(factory).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('缓存未命中时调用 factory 并缓存结果', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      const computed = { id: 2, name: 'Computed' };
      const factory = jest.fn().mockResolvedValue(computed);

      const result = await service.getOrSet('user:2', factory);

      expect(result).toEqual(computed);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        'user:2',
        JSON.stringify(computed),
        undefined,
      );
    });

    it('缓存未命中，带 TTL 写入', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      const factory = jest.fn().mockResolvedValue([1, 2, 3]);

      const result = await service.getOrSet('list', factory, 600);

      expect(result).toEqual([1, 2, 3]);
      expect(redis.set).toHaveBeenCalledWith('list', '[1,2,3]', 600);
    });

    it('factory 返回 null 时也写入缓存', async () => {
      // getOrSet checks `if (cached !== null)`, so factory result null would still be written
      // but since get returns null (miss), factory is called
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      const factory = jest.fn().mockResolvedValue(null);

      const result = await service.getOrSet('nullable', factory);

      expect(factory).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith('nullable', 'null', undefined);
      expect(result).toBeNull();
    });
  });

  // ─── invalidatePattern ─────────────────────────────────────────────────────

  describe('invalidatePattern', () => {
    it('匹配到 key 时批量删除', async () => {
      redis.keys.mockResolvedValue(['user:1', 'user:2', 'user:3']);
      redis.del.mockResolvedValue(3);

      await service.invalidatePattern('user:*');

      expect(redis.keys).toHaveBeenCalledWith('user:*');
      expect(redis.del).toHaveBeenCalledWith('user:1', 'user:2', 'user:3');
    });

    it('没有匹配的 key 时不调用 del', async () => {
      redis.keys.mockResolvedValue([]);

      await service.invalidatePattern('nonexistent:*');

      expect(redis.keys).toHaveBeenCalledWith('nonexistent:*');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('匹配到单个 key', async () => {
      redis.keys.mockResolvedValue(['session:abc123']);
      redis.del.mockResolvedValue(1);

      await service.invalidatePattern('session:*');

      expect(redis.del).toHaveBeenCalledWith('session:abc123');
    });
  });
});
