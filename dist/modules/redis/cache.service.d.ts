import { RedisService } from './redis.service';
export declare class CacheService {
    private readonly redis;
    constructor(redis: RedisService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
    getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    invalidatePattern(pattern: string): Promise<void>;
}
