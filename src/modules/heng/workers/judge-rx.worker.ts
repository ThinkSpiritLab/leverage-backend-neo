import { Logger } from '@nestjs/common'
import { Process, Processor } from '@nestjs/bull'
import { Job } from 'bull'
import { JUDGE_RX_QUEUE } from '../../queue/queue.constants'
import { RedisService } from '../../redis/redis.service'
import { ReceiveService } from '../../receive/receive.service'
import { JudgeResult, JudgeRxPayload, JudgeStateUpdate } from '../heng.types'

/**
 * JudgeRxWorker
 *
 * 消费 judge-rx 队列，处理 heng-controller 的回调结果：
 * 1. 验证 judgeId 是否在 Redis Set 中（防止旧评测结果覆盖，即防重放）
 * 2. 根据类型分发到 ReceiveService
 *    - update: 更新中间状态到 Redis
 *    - finish: 写入数据库，更新统计，更新排行榜
 */
@Processor(JUDGE_RX_QUEUE)
export class JudgeRxWorker {
  private readonly logger = new Logger(JudgeRxWorker.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly receiveService: ReceiveService,
  ) {}

  @Process()
  async handle(job: Job<JudgeRxPayload>): Promise<void> {
    const { submissionId, judgeId, type, data } = job.data

    // Step 1: 验证 judgeId 是否合法（防止旧评测结果覆盖）
    const isMember = await this.redisService.sismember(`judge-ids:${submissionId}`, judgeId)
    if (!isMember) {
      this.logger.warn(
        `Stale judgeId ${judgeId} for submission ${submissionId}, ignoring`,
      )
      return
    }

    // Step 2: 分发处理
    if (type === 'finish') {
      this.logger.log(`Receiving finish result: submissionId=${submissionId}`)
      await this.receiveService.receiveResult(submissionId, data as JudgeResult)

      // 评测完成，清理 judgeId（防止重复处理）
      await this.redisService.srem(`judge-ids:${submissionId}`, judgeId)
      this.logger.log(`Finish processed: submissionId=${submissionId}, judgeId=${judgeId}`)
    } else {
      // type === 'update'
      this.logger.debug(`Receiving state update: submissionId=${submissionId}`)
      await this.receiveService.receiveUpdate(submissionId, data as JudgeStateUpdate)
    }
  }
}
