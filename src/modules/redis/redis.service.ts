import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: IORedis;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = new IORedis({
      host: this.config.get<string>('redis.host', 'localhost'),
      port: this.config.get<number>('redis.port', 6379),
      lazyConnect: true,
    });
    await this.client.connect();
    this.logger.log('RedisService connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): IORedis {
    return this.client;
  }

  // ─── Basic ───────────────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string | number,
    ttlSeconds?: number,
  ): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, String(value));
    } else {
      await this.client.set(key, String(value));
    }
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async incrby(key: string, increment: number): Promise<number> {
    return this.client.incrby(key, increment);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async exists(...keys: string[]): Promise<number> {
    return this.client.exists(...keys);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  // ─── Set ─────────────────────────────────────────────────────────────────────

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.client.sismember(key, member);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  // ─── Hash ─────────────────────────────────────────────────────────────────────

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(
    key: string,
    field: string,
    value: string | number,
  ): Promise<number> {
    return this.client.hset(key, field, String(value));
  }

  async hmset(
    key: string,
    data: Record<string, string | number>,
  ): Promise<void> {
    await this.client.hmset(key, data as Record<string, string>);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  // ─── Sorted Set (排行榜用) ─────────────────────────────────────────────────

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zadd(key, score, member);
  }

  async zaddMany(
    key: string,
    members: Array<{ score: number; member: string }>,
  ): Promise<number> {
    if (members.length === 0) return 0;
    const args: Array<number | string> = [];
    for (const { score, member } of members) {
      args.push(score, member);
    }
    return this.client.zadd(
      key,
      ...(args as [number, string, ...Array<number | string>]),
    );
  }

  async zincrby(
    key: string,
    increment: number,
    member: string,
  ): Promise<string> {
    return this.client.zincrby(key, increment, member);
  }

  async zrank(key: string, member: string): Promise<number | null> {
    return this.client.zrank(key, member);
  }

  async zrevrank(key: string, member: string): Promise<number | null> {
    return this.client.zrevrank(key, member);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    return this.client.zscore(key, member);
  }

  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<string[]> {
    return this.client.zrangebyscore(key, min, max);
  }

  async zrevrangebyscore(
    key: string,
    max: number | string,
    min: number | string,
  ): Promise<string[]> {
    return this.client.zrevrangebyscore(key, max, min);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(key, start, stop);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.client.zrem(key, ...members);
  }
}
