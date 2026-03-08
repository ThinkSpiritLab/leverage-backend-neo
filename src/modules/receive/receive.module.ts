import { Module } from '@nestjs/common'
import { ReceiveService } from './receive.service'
import { RedisModule } from '../redis/redis.module'
import { RankModule } from '../rank/rank.module'

/**
 * ReceiveModule
 *
 * 评测结果处理模块：
 * - ReceiveService：接收并处理 heng-controller 回调的评测结果
 */
@Module({
  imports: [
    RedisModule,
    RankModule,
  ],
  providers: [ReceiveService],
  exports: [ReceiveService],
})
export class ReceiveModule {}
