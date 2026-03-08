import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { RedisService } from './redis.service'

// ─── Mock ioredis ─────────────────────────────────────────────────────────────

const mockConnect = jest.fn().mockResolvedValue(undefined)
const mockQuit = jest.fn().mockResolvedValue(undefined)
const mockRedisClient = {
  connect: mockConnect,
  quit: mockQuit,
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  incrby: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  exists: jest.fn(),
  keys: jest.fn(),
  sadd: jest.fn(),
  smembers: jest.fn(),
  srem: jest.fn(),
  sismember: jest.fn(),
  scard: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hmset: jest.fn(),
  hgetall: jest.fn(),
  hdel: jest.fn(),
  zadd: jest.fn(),
  zincrby: jest.fn(),
  zrank: jest.fn(),
  zrevrank: jest.fn(),
  zscore: jest.fn(),
  zrangebyscore: jest.fn(),
  zrevrangebyscore: jest.fn(),
  zrange: jest.fn(),
  zrevrange: jest.fn(),
  zcard: jest.fn(),
  zrem: jest.fn(),
}

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedisClient),
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockConfigService = () => ({
  get: jest.fn().mockImplementation((key: string, defaultVal: any) => defaultVal),
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RedisService', () => {
  let service: RedisService

  beforeEach(async () => {
    // Reset all mock functions
    Object.values(mockRedisClient).forEach((fn) => {
      if (typeof fn === 'function') (fn as jest.Mock).mockReset()
    })
    mockConnect.mockResolvedValue(undefined)
    mockQuit.mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useFactory: mockConfigService },
      ],
    }).compile()

    service = module.get<RedisService>(RedisService)

    // Initialize the service to set up the client
    await service.onModuleInit()
  })

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  describe('onModuleInit / onModuleDestroy', () => {
    it('初始化时连接 Redis', async () => {
      expect(mockConnect).toHaveBeenCalled()
    })

    it('销毁时断开 Redis', async () => {
      await service.onModuleDestroy()
      expect(mockQuit).toHaveBeenCalled()
    })

    it('getClient 返回 Redis 客户端', () => {
      const client = service.getClient()
      expect(client).toBeDefined()
    })
  })

  // ─── Basic operations ──────────────────────────────────────────────────────

  describe('get', () => {
    it('返回字符串值', async () => {
      mockRedisClient.get.mockResolvedValue('hello')
      const result = await service.get('key')
      expect(result).toBe('hello')
      expect(mockRedisClient.get).toHaveBeenCalledWith('key')
    })

    it('key 不存在时返回 null', async () => {
      mockRedisClient.get.mockResolvedValue(null)
      const result = await service.get('missing')
      expect(result).toBeNull()
    })
  })

  describe('set', () => {
    it('无 TTL 使用 set', async () => {
      mockRedisClient.set.mockResolvedValue('OK')
      await service.set('key', 'value')
      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value')
    })

    it('有 TTL 使用 setex', async () => {
      mockRedisClient.setex.mockResolvedValue('OK')
      await service.set('key', 'value', 60)
      expect(mockRedisClient.setex).toHaveBeenCalledWith('key', 60, 'value')
    })

    it('数值 value 转为字符串', async () => {
      mockRedisClient.set.mockResolvedValue('OK')
      await service.set('counter', 42)
      expect(mockRedisClient.set).toHaveBeenCalledWith('counter', '42')
    })

    it('数值 value 带 TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK')
      await service.set('counter', 100, 30)
      expect(mockRedisClient.setex).toHaveBeenCalledWith('counter', 30, '100')
    })
  })

  describe('del', () => {
    it('删除单个 key', async () => {
      mockRedisClient.del.mockResolvedValue(1)
      const result = await service.del('key1')
      expect(result).toBe(1)
      expect(mockRedisClient.del).toHaveBeenCalledWith('key1')
    })

    it('删除多个 key', async () => {
      mockRedisClient.del.mockResolvedValue(2)
      const result = await service.del('key1', 'key2')
      expect(result).toBe(2)
      expect(mockRedisClient.del).toHaveBeenCalledWith('key1', 'key2')
    })
  })

  describe('incr / incrby', () => {
    it('incr 自增', async () => {
      mockRedisClient.incr.mockResolvedValue(5)
      const result = await service.incr('counter')
      expect(result).toBe(5)
      expect(mockRedisClient.incr).toHaveBeenCalledWith('counter')
    })

    it('incrby 增加指定值', async () => {
      mockRedisClient.incrby.mockResolvedValue(15)
      const result = await service.incrby('counter', 10)
      expect(result).toBe(15)
      expect(mockRedisClient.incrby).toHaveBeenCalledWith('counter', 10)
    })
  })

  describe('expire / ttl', () => {
    it('设置过期时间', async () => {
      mockRedisClient.expire.mockResolvedValue(1)
      await service.expire('key', 300)
      expect(mockRedisClient.expire).toHaveBeenCalledWith('key', 300)
    })

    it('获取剩余 TTL', async () => {
      mockRedisClient.ttl.mockResolvedValue(250)
      const result = await service.ttl('key')
      expect(result).toBe(250)
      expect(mockRedisClient.ttl).toHaveBeenCalledWith('key')
    })
  })

  describe('exists', () => {
    it('key 存在时返回 1', async () => {
      mockRedisClient.exists.mockResolvedValue(1)
      const result = await service.exists('key')
      expect(result).toBe(1)
    })

    it('key 不存在时返回 0', async () => {
      mockRedisClient.exists.mockResolvedValue(0)
      const result = await service.exists('missing')
      expect(result).toBe(0)
    })

    it('检查多个 key', async () => {
      mockRedisClient.exists.mockResolvedValue(2)
      const result = await service.exists('k1', 'k2', 'k3')
      expect(result).toBe(2)
      expect(mockRedisClient.exists).toHaveBeenCalledWith('k1', 'k2', 'k3')
    })
  })

  describe('keys', () => {
    it('返回匹配的 key 列表', async () => {
      mockRedisClient.keys.mockResolvedValue(['key:1', 'key:2'])
      const result = await service.keys('key:*')
      expect(result).toEqual(['key:1', 'key:2'])
      expect(mockRedisClient.keys).toHaveBeenCalledWith('key:*')
    })
  })

  // ─── Set operations ────────────────────────────────────────────────────────

  describe('Set 操作', () => {
    it('sadd 添加成员', async () => {
      mockRedisClient.sadd.mockResolvedValue(2)
      const result = await service.sadd('myset', 'a', 'b')
      expect(result).toBe(2)
      expect(mockRedisClient.sadd).toHaveBeenCalledWith('myset', 'a', 'b')
    })

    it('smembers 返回所有成员', async () => {
      mockRedisClient.smembers.mockResolvedValue(['a', 'b', 'c'])
      const result = await service.smembers('myset')
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('srem 删除成员', async () => {
      mockRedisClient.srem.mockResolvedValue(1)
      const result = await service.srem('myset', 'a')
      expect(result).toBe(1)
    })

    it('sismember 检查成员', async () => {
      mockRedisClient.sismember.mockResolvedValue(1)
      const result = await service.sismember('myset', 'a')
      expect(result).toBe(1)
    })

    it('scard 返回集合大小', async () => {
      mockRedisClient.scard.mockResolvedValue(3)
      const result = await service.scard('myset')
      expect(result).toBe(3)
    })
  })

  // ─── Hash operations ───────────────────────────────────────────────────────

  describe('Hash 操作', () => {
    it('hset 设置字段', async () => {
      mockRedisClient.hset.mockResolvedValue(1)
      const result = await service.hset('hash', 'field', 'value')
      expect(result).toBe(1)
      expect(mockRedisClient.hset).toHaveBeenCalledWith('hash', 'field', 'value')
    })

    it('hset 数值转字符串', async () => {
      mockRedisClient.hset.mockResolvedValue(0)
      await service.hset('hash', 'count', 42)
      expect(mockRedisClient.hset).toHaveBeenCalledWith('hash', 'count', '42')
    })

    it('hget 获取字段', async () => {
      mockRedisClient.hget.mockResolvedValue('value')
      const result = await service.hget('hash', 'field')
      expect(result).toBe('value')
      expect(mockRedisClient.hget).toHaveBeenCalledWith('hash', 'field')
    })

    it('hget 字段不存在时返回 null', async () => {
      mockRedisClient.hget.mockResolvedValue(null)
      const result = await service.hget('hash', 'missing')
      expect(result).toBeNull()
    })

    it('hmset 批量设置', async () => {
      mockRedisClient.hmset.mockResolvedValue('OK')
      await service.hmset('hash', { field1: 'v1', field2: 'v2' })
      expect(mockRedisClient.hmset).toHaveBeenCalledWith('hash', { field1: 'v1', field2: 'v2' })
    })

    it('hgetall 获取所有字段', async () => {
      const data = { field1: 'v1', field2: 'v2' }
      mockRedisClient.hgetall.mockResolvedValue(data)
      const result = await service.hgetall('hash')
      expect(result).toEqual(data)
    })

    it('hdel 删除字段', async () => {
      mockRedisClient.hdel.mockResolvedValue(1)
      const result = await service.hdel('hash', 'field1')
      expect(result).toBe(1)
      expect(mockRedisClient.hdel).toHaveBeenCalledWith('hash', 'field1')
    })

    it('hdel 删除多个字段', async () => {
      mockRedisClient.hdel.mockResolvedValue(2)
      const result = await service.hdel('hash', 'f1', 'f2')
      expect(result).toBe(2)
    })
  })

  // ─── Sorted Set operations ─────────────────────────────────────────────────

  describe('Sorted Set 操作', () => {
    it('zadd 添加成员', async () => {
      mockRedisClient.zadd.mockResolvedValue(1)
      const result = await service.zadd('zset', 100, 'member1')
      expect(result).toBe(1)
      expect(mockRedisClient.zadd).toHaveBeenCalledWith('zset', 100, 'member1')
    })

    it('zaddMany 批量添加成员', async () => {
      mockRedisClient.zadd.mockResolvedValue(2)
      const result = await service.zaddMany('zset', [
        { score: 100, member: 'm1' },
        { score: 200, member: 'm2' },
      ])
      expect(result).toBe(2)
      expect(mockRedisClient.zadd).toHaveBeenCalledWith('zset', 100, 'm1', 200, 'm2')
    })

    it('zaddMany 空数组时返回 0', async () => {
      const result = await service.zaddMany('zset', [])
      expect(result).toBe(0)
      expect(mockRedisClient.zadd).not.toHaveBeenCalled()
    })

    it('zincrby 增加分数', async () => {
      mockRedisClient.zincrby.mockResolvedValue('150')
      const result = await service.zincrby('zset', 50, 'm1')
      expect(result).toBe('150')
      expect(mockRedisClient.zincrby).toHaveBeenCalledWith('zset', 50, 'm1')
    })

    it('zrank 返回正序排名', async () => {
      mockRedisClient.zrank.mockResolvedValue(2)
      const result = await service.zrank('zset', 'm3')
      expect(result).toBe(2)
      expect(mockRedisClient.zrank).toHaveBeenCalledWith('zset', 'm3')
    })

    it('zrank 成员不存在时返回 null', async () => {
      mockRedisClient.zrank.mockResolvedValue(null)
      const result = await service.zrank('zset', 'missing')
      expect(result).toBeNull()
    })

    it('zrevrank 返回倒序排名', async () => {
      mockRedisClient.zrevrank.mockResolvedValue(0)
      const result = await service.zrevrank('zset', 'top')
      expect(result).toBe(0)
    })

    it('zscore 返回分数', async () => {
      mockRedisClient.zscore.mockResolvedValue('300')
      const result = await service.zscore('zset', 'm1')
      expect(result).toBe('300')
      expect(mockRedisClient.zscore).toHaveBeenCalledWith('zset', 'm1')
    })

    it('zscore 成员不存在时返回 null', async () => {
      mockRedisClient.zscore.mockResolvedValue(null)
      const result = await service.zscore('zset', 'missing')
      expect(result).toBeNull()
    })

    it('zrange 返回范围成员', async () => {
      mockRedisClient.zrange.mockResolvedValue(['m1', 'm2', 'm3'])
      const result = await service.zrange('zset', 0, 2)
      expect(result).toEqual(['m1', 'm2', 'm3'])
      expect(mockRedisClient.zrange).toHaveBeenCalledWith('zset', 0, 2)
    })

    it('zrevrange 返回倒序范围成员', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['m3', 'm2', 'm1'])
      const result = await service.zrevrange('zset', 0, 2)
      expect(result).toEqual(['m3', 'm2', 'm1'])
      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith('zset', 0, 2)
    })

    it('zrangebyscore 按分数范围查询', async () => {
      mockRedisClient.zrangebyscore.mockResolvedValue(['m1', 'm2'])
      const result = await service.zrangebyscore('zset', 100, 200)
      expect(result).toEqual(['m1', 'm2'])
      expect(mockRedisClient.zrangebyscore).toHaveBeenCalledWith('zset', 100, 200)
    })

    it('zrevrangebyscore 按分数范围倒序查询', async () => {
      mockRedisClient.zrevrangebyscore.mockResolvedValue(['m2', 'm1'])
      const result = await service.zrevrangebyscore('zset', 200, 100)
      expect(result).toEqual(['m2', 'm1'])
      expect(mockRedisClient.zrevrangebyscore).toHaveBeenCalledWith('zset', 200, 100)
    })

    it('zcard 返回集合大小', async () => {
      mockRedisClient.zcard.mockResolvedValue(5)
      const result = await service.zcard('zset')
      expect(result).toBe(5)
      expect(mockRedisClient.zcard).toHaveBeenCalledWith('zset')
    })

    it('zrem 删除成员', async () => {
      mockRedisClient.zrem.mockResolvedValue(1)
      const result = await service.zrem('zset', 'm1')
      expect(result).toBe(1)
      expect(mockRedisClient.zrem).toHaveBeenCalledWith('zset', 'm1')
    })

    it('zrem 删除多个成员', async () => {
      mockRedisClient.zrem.mockResolvedValue(2)
      const result = await service.zrem('zset', 'm1', 'm2')
      expect(result).toBe(2)
    })

    it('zrangebyscore 支持 -inf/+inf', async () => {
      mockRedisClient.zrangebyscore.mockResolvedValue(['m1', 'm2', 'm3'])
      const result = await service.zrangebyscore('zset', '-inf', '+inf')
      expect(result).toEqual(['m1', 'm2', 'm3'])
      expect(mockRedisClient.zrangebyscore).toHaveBeenCalledWith('zset', '-inf', '+inf')
    })
  })
})
