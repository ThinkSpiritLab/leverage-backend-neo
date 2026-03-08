import RedisMock from 'ioredis-mock'
import { RedisService } from '../../src/modules/redis/redis.service'
import { CacheService } from '../../src/modules/redis/cache.service'

/**
 * Creates a mock RedisService backed by ioredis-mock.
 * Use this in integration tests to avoid connecting to a real Redis instance.
 */
export function createRedisMock(): RedisMock {
  return new RedisMock()
}

/**
 * Creates a mock RedisService instance using ioredis-mock under the hood.
 * The returned object implements the same interface as RedisService.
 */
export function createMockRedisService(client?: RedisMock): Partial<RedisService> {
  const redis = client ?? new RedisMock()

  return {
    getClient: () => redis as any,
    get: (key: string) => redis.get(key),
    set: async (key: string, value: string | number, ttlSeconds?: number) => {
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, String(value))
      } else {
        await redis.set(key, String(value))
      }
    },
    del: (...keys: string[]) => redis.del(...keys),
    incr: (key: string) => redis.incr(key),
    incrby: (key: string, increment: number) => redis.incrby(key, increment),
    expire: async (key: string, ttlSeconds: number) => {
      await redis.expire(key, ttlSeconds)
    },
    ttl: (key: string) => redis.ttl(key),
    exists: (...keys: string[]) => redis.exists(...keys),
    keys: (pattern: string) => redis.keys(pattern),
    sadd: (key: string, ...members: string[]) => redis.sadd(key, ...members),
    smembers: (key: string) => redis.smembers(key),
    srem: (key: string, ...members: string[]) => redis.srem(key, ...members),
    sismember: (key: string, member: string) => redis.sismember(key, member),
    scard: (key: string) => redis.scard(key),
    hget: (key: string, field: string) => redis.hget(key, field),
    hset: (key: string, field: string, value: string | number) =>
      redis.hset(key, field, String(value)),
    hmset: async (key: string, data: Record<string, string | number>) => {
      await redis.hmset(key, data as Record<string, string>)
    },
    hgetall: (key: string) => redis.hgetall(key),
    hdel: (key: string, ...fields: string[]) => redis.hdel(key, ...fields),
    zadd: (key: string, score: number, member: string) => redis.zadd(key, score, member),
    zincrby: (key: string, increment: number, member: string) =>
      redis.zincrby(key, increment, member),
    zrank: (key: string, member: string) => redis.zrank(key, member),
    zrevrank: (key: string, member: string) => redis.zrevrank(key, member),
    zscore: (key: string, member: string) => redis.zscore(key, member),
    zrange: (key: string, start: number, stop: number) => redis.zrange(key, start, stop),
    zrevrange: (key: string, start: number, stop: number) => redis.zrevrange(key, start, stop),
    zcard: (key: string) => redis.zcard(key),
    zrem: (key: string, ...members: string[]) => redis.zrem(key, ...members),
  }
}

/**
 * Creates a CacheService instance backed by a mock Redis.
 */
export function createMockCacheService(client?: RedisMock): CacheService {
  const mockRedis = createMockRedisService(client)
  return new CacheService(mockRedis as RedisService)
}
