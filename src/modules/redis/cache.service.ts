import { Injectable } from '@nestjs/common'
import { RedisService } from './redis.service'

/**
 * Generic cache wrapper with TTL support.
 * Values are JSON-serialized, so any serializable type is supported.
 */
@Injectable()
export class CacheService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Get a cached value. Returns null if not found or expired.
   */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  /**
   * Set a cached value with optional TTL (seconds).
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value)
    await this.redis.set(key, serialized, ttlSeconds)
  }

  /**
   * Delete a cached value.
   */
  async del(...keys: string[]): Promise<void> {
    await this.redis.del(...keys)
  }

  /**
   * Get or compute: if cache miss, run factory and cache the result.
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached
    const value = await factory()
    await this.set(key, value, ttlSeconds)
    return value
  }

  /**
   * Invalidate all keys matching a pattern (use with caution in production).
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern)
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }
}
