import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisService } from './redis.service';
import { LeaseService } from './lease.service';

@Global()
@Module({
  providers: [RedisService, CacheService, LeaseService],
  exports: [RedisService, CacheService, LeaseService],
})
export class RedisModule {}
