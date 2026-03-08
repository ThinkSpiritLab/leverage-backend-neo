import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JUDGE_TX_QUEUE } from '../../queue/queue.constants';
import { HengClientService } from '../heng-client.service';
import { RedisService } from '../../redis/redis.service';
import { CreateJudgeRequest, JudgeTxPayload } from '../heng.types';

/**
 * JudgeTxWorker
 *
 * 消费 judge-tx 队列，将评测任务发送给 heng-controller：
 * 1. 生成 judgeId（32 字节随机 hex）
 * 2. Redis SADD 记录 judgeId（防重放验证）
 * 3. 构建 CreateJudgeRequest（含回调 URL）
 * 4. HTTP POST heng-controller /c/v1/judges
 */
@Injectable()
@Processor(JUDGE_TX_QUEUE)
export class JudgeTxWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(JudgeTxWorker.name);

  constructor(
    @InjectQueue(JUDGE_TX_QUEUE) private readonly queue: Queue,
    private readonly hengClient: HengClientService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`JudgeTxWorker shutting down on signal ${signal}`);
    // Close the queue: stop accepting new jobs, wait for active jobs to complete
    await this.queue.close();
    this.logger.log('JudgeTxWorker queue closed');
  }

  @Process('judge')
  async handle(job: Job<JudgeTxPayload>): Promise<void> {
    const { submissionId, task } = job.data;

    // Step 1: 生成唯一 judgeId（32 字节随机 hex）
    const judgeId = randomBytes(16).toString('hex');

    this.logger.log(
      `Processing judge-tx: submissionId=${submissionId}, judgeId=${judgeId}`,
    );

    // Step 2: Redis SADD 记录 judgeId，防止旧评测结果覆盖（防重放）
    await this.redisService.sadd(`judge-ids:${submissionId}`, judgeId);

    // Step 3: 构建 CreateJudgeRequest，注入回调 URL
    const callbackBase = this.configService.get<string>(
      'baseUrl',
      'http://localhost:3000',
    );
    const request: CreateJudgeRequest = {
      ...task,
      callbackUrls: {
        update: `${callbackBase}/heng/update/${submissionId}/${judgeId}`,
        finish: `${callbackBase}/heng/finish/${submissionId}/${judgeId}`,
      },
    };

    // Step 4: 发送给 heng-controller
    try {
      await this.hengClient.createJudge(request);
      this.logger.log(
        `Submitted to heng: submissionId=${submissionId}, judgeId=${judgeId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to submit to heng: submissionId=${submissionId}`,
        err,
      );
      // 提交失败时清理 judgeId，避免孤立 key
      await this.redisService.srem(`judge-ids:${submissionId}`, judgeId);
      throw err; // 让 BullMQ 重试
    }
  }
}
