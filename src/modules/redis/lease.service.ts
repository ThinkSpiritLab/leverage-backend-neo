import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

const RENEW = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;
const SET_IF_OWNED = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2])
  return 1
end
return 0`;

/** Short-lived coordination only; the caller's database operations must be idempotent. */
@Injectable()
export class LeaseService {
  constructor(private readonly redis: RedisService) {}

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis
      .getClient()
      .set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  async renew(key: string, token: string, ttlMs: number): Promise<boolean> {
    return (
      (await this.redis.getClient().eval(RENEW, 1, key, token, ttlMs)) === 1
    );
  }

  async release(key: string, token: string): Promise<boolean> {
    return (await this.redis.getClient().eval(RELEASE, 1, key, token)) === 1;
  }

  async setIfOwned(
    key: string,
    token: string,
    stateKey: string,
    value: string,
  ): Promise<boolean> {
    return (
      (await this.redis
        .getClient()
        .eval(SET_IF_OWNED, 2, key, stateKey, token, value)) === 1
    );
  }
}
