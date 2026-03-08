import { Module } from '@nestjs/common'
import { HengClientService } from './heng-client.service'
import { HengController } from './heng.controller'
import { JudgeTxWorker } from './workers/judge-tx.worker'
import { JudgeRxWorker } from './workers/judge-rx.worker'
import { QueueModule } from '../queue/queue.module'
import { RedisModule } from '../redis/redis.module'
import { ReceiveModule } from '../receive/receive.module'

/**
 * HengModule
 *
 * 包含：
 * - HengClientService：与 heng-controller HTTP 通信
 * - HengController：接收 heng-controller 回调，推入 judge-rx 队列
 * - JudgeTxWorker：消费 judge-tx 队列，提交评测任务
 * - JudgeRxWorker：消费 judge-rx 队列，分发给 ReceiveService
 */
@Module({
  imports: [
    QueueModule,
    RedisModule,
    ReceiveModule,
  ],
  controllers: [HengController],
  providers: [
    HengClientService,
    JudgeTxWorker,
    JudgeRxWorker,
  ],
  exports: [HengClientService],
})
export class HengModule {}
