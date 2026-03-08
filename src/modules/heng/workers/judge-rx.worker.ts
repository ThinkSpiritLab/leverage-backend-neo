import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { JUDGE_RX_QUEUE } from '../../queue/queue.constants';
import { RedisService } from '../../redis/redis.service';
import { ReceiveService } from '../../receive/receive.service';
import { JudgeResult, JudgeRxPayload } from '../heng.types';

/**
 * JudgeRxWorker
 *
 * 消费 judge-rx 队列，处理 heng-controller 的回调结果：
 * 1. 验证 judgeId 是否在 Redis Set 中（防止旧评测结果覆盖，即防重放）
 * 2. 根据类型分发到 ReceiveService
 *    - update: 更新中间状态到 Redis
 *    - finish: 写入数据库，更新统计，更新排行榜
 */
@Injectable()
@Processor(JUDGE_RX_QUEUE)
export class JudgeRxWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(JudgeRxWorker.name);

  constructor(
    @InjectQueue(JUDGE_RX_QUEUE) private readonly queue: Queue,
    private readonly redisService: RedisService,
    private readonly receiveService: ReceiveService,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`JudgeRxWorker shutting down on signal ${signal}`);
    // Close the queue: stop accepting new jobs, wait for active jobs to complete
    await this.queue.close();
    this.logger.log('JudgeRxWorker queue closed');
  }

  @Process()
  async handle(job: Job<JudgeRxPayload>): Promise<void> {
    const { submissionId, judgeId, type, data } = job.data;

    // Step 1: 验证 judgeId 是否合法（防止旧评测结果覆盖）
    const isMember = await this.redisService.sismember(
      `judge-ids:${submissionId}`,
      judgeId,
    );
    if (!isMember) {
      this.logger.warn(
        `Stale judgeId ${judgeId} for submission ${submissionId}, ignoring`,
      );
      return;
    }

    // Step 2: 分发处理
    if (type === 'finish') {
      this.logger.log(`Receiving finish result: submissionId=${submissionId}`);
      await this.receiveService.receiveResult(submissionId, data);

      // 评测完成，清理 judgeId（防止重复处理）
      await this.redisService.srem(`judge-ids:${submissionId}`, judgeId);
      this.logger.log(
        `Finish processed: submissionId=${submissionId}, judgeId=${judgeId}`,
      );
    } else {
      // type === 'update'
      this.logger.debug(`Receiving state update: submissionId=${submissionId}`);
      await this.receiveService.receiveUpdate(submissionId, data);
    }
  }
}
