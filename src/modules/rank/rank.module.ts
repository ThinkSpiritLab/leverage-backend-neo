import { Module } from '@nestjs/common'
import { RankService } from './rank.service'
import { RedisModule } from '../redis/redis.module'

/**
 * RankModule
 *
 * 排行榜模块（Redis Sorted Set 实时更新）
 */
@Module({
  imports: [RedisModule],
  providers: [RankService],
  exports: [RankService],
})
export class RankModule {}
