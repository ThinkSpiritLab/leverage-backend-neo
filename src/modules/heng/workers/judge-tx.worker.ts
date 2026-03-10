import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { JUDGE_TX_QUEUE } from '../../queue/queue.constants';
import { HengClientService } from '../heng-client.service';
import { RedisService } from '../../redis/redis.service';
import { CreateJudgeRequest, JudgeTxPayload } from '../heng.types';
import {
  JUDGE_QUEUE_ACTIVE_GAUGE,
  JUDGE_QUEUE_WAITING_GAUGE,
} from '../../metrics/metrics.module';
import { Match } from '../../../database/entities/match.entity';
import { MatchStatus } from '../../compete/compete.service';
import type { CompeteTxPayload } from '../../compete/compete-tx.worker';

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
    @InjectMetric(JUDGE_QUEUE_WAITING_GAUGE)
    private readonly waitingGauge: Gauge<string>,
    @InjectMetric(JUDGE_QUEUE_ACTIVE_GAUGE)
    private readonly activeGauge: Gauge<string>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
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

    // Update queue gauges
    const [waiting, active] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
    ]);
    this.waitingGauge.set(waiting);
    this.activeGauge.set(active);

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

  // ─── Compete job handler ────────────────────────────────────────────────────

  @Process('compete')
  async handleCompete(job: Job<CompeteTxPayload>): Promise<void> {
    const { matchId, game, gamers } = job.data;
    this.logger.log(`Processing compete job: matchId=${matchId}, gamers=${gamers.length}`);

    const baseUrl = this.configService.get<string>('botzone.baseUrl', '');
    const apiKey = this.configService.get<string>('botzone.apiKey', '');
    const callbackBase = this.configService.get<string>('baseUrl', 'http://localhost:3000');
    const callbackToken = this.configService.get<string>('botzone.callbackToken', '');
    const tokenParam = callbackToken ? `?token=${encodeURIComponent(callbackToken)}` : '';
    const callbackUrl = `${callbackBase}/compete/match-callback/${matchId}${tokenParam}`;

    // botzone-neo BotzoneTaskDto format:
    // game: { judger: {language, source, limit}, "0": {...}, "1": {...} }
    // callback: { update, finish }
    const gameField: Record<string, { language: string; source: string; limit: { time: number; memory: number } }> = {
      judger: {
        language: game.judgerLanguage,
        source: game.judgerCode,
        limit: { time: game.timeLimit, memory: game.memoryLimit },
      },
    };
    gamers.forEach((gamer, index) => {
      const isExternal = (gamer.type === 'webhook' || gamer.type === 'human' || gamer.type === 'external') && gamer.webhookUrl;
      (gameField as Record<string, unknown>)[String(index)] = {
        language: isExternal ? 'webhook' : (gamer.language ?? 'python'),
        source: isExternal ? '' : (gamer.code ?? ''),
        limit: { time: game.timeLimit, memory: game.memoryLimit },
        runnerType: isExternal ? 'webhook' : 'code',
        externalUrl: isExternal ? gamer.webhookUrl : undefined,
        webhookTimeoutMs: isExternal ? gamer.webhookTimeoutMs : undefined,
      };
    });

    const body = {
      type: 'botzone',
      game: gameField,
      callback: {
        update: callbackUrl,
        finish: callbackUrl,
      },
    };

    if (!baseUrl) {
      this.logger.warn(`BOTZONE_BASE_URL not set — marking match ${matchId} as ERROR`);
      await this.matchRepo.update(matchId, { status: MatchStatus.ERROR });
      return;
    }

    try {
      const res = await axios.post<{ jobId: string }>(`${baseUrl}/v1/judge`, body, {
        timeout: 10_000,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      });
      const { jobId } = res.data;
      this.logger.log(`Compete job accepted by botzone: matchId=${matchId}, jobId=${jobId}`);
      await this.matchRepo.update(matchId, { externalJobId: jobId, status: MatchStatus.RUNNING });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const axiosErr = err as { response?: { data?: unknown; status?: number } };
      this.logger.error(
        `Failed to submit compete job: matchId=${matchId} baseUrl=${baseUrl} err=${msg} status=${axiosErr?.response?.status} data=${JSON.stringify(axiosErr?.response?.data)}`,
      );
      await this.matchRepo.update(matchId, { status: MatchStatus.ERROR });
      throw err;
    }
  }
}
