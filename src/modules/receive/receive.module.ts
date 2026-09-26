import { Module } from '@nestjs/common';
import { ReceiveService } from './receive.service';
import { RedisModule } from '../redis/redis.module';
import { RankModule } from '../rank/rank.module';

/**
 * ReceiveModule
 *
 * 评测结果处理模块：内部 worker 的事务结算与排名发布。
 */
@Module({
  imports: [RedisModule, RankModule],
  providers: [ReceiveService],
  exports: [ReceiveService],
})
export class ReceiveModule {}
