import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
export declare class HealthController {
    private readonly dataSource;
    private readonly redis;
    constructor(dataSource: DataSource, redis: RedisService);
    check(): Promise<{
        status: string;
        timestamp: string;
    }>;
}
