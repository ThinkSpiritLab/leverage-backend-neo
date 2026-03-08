import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Submission } from '../../database/entities/submission.entity';
import { RankService } from '../rank/rank.service';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';

@Injectable()
export class TransmitService {
  private readonly logger = new Logger(TransmitService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    private readonly rankService: RankService,
    @InjectQueue(JUDGE_TX_QUEUE)
    private readonly judgeTxQueue: Queue,
  ) {}

  /**
   * 列出所有评测机（已弃用，返回静态数据）
   */
  async listJudgers() {
    const baseUrl = process.env.HENG_BASE_URL ?? '';
    let online = false;
    if (baseUrl) {
      try {
        const axiosModule = await import('axios');
        await axiosModule.default.get(`${baseUrl}/`, {
          timeout: 2000,
          validateStatus: () => true, // treat any HTTP response as online
        });
        online = true;
      } catch {
        online = false;
      }
    }
    return [
      {
        name: 'Heng',
        version: '-',
        ttl: online ? 30 : 0,
      },
    ];
  }

  /**
   * 从 OSS 刷新测试文件（OSS 未配置，跳过）
   */
  refreshTestFiles() {
    this.logger.log('refresh-test-files: OSS not configured, skipping');
    return { message: 'OSS not configured' };
  }

  /**
   * 重建 Redis Sorted Set 排行榜
   * 遍历所有关联竞赛/课程的提交，按 AC 数和罚时重算
   */
  async rebuildRankLog(): Promise<{ rebuilt: number }> {
    this.logger.log('rebuildRankLog: starting...');

    // 获取所有竞赛提交
    const contestSubmissions = await this.submissionRepo
      .createQueryBuilder('s')
      .select(['s.userId', 's.contestId', 's.status', 's.createdAt'])
      .where('s.contestId IS NOT NULL')
      .orderBy('s.createdAt', 'ASC')
      .getMany();

    // 按 (contestId, userId) 聚合
    const contestMap = new Map<
      string,
      { acCount: number; penaltySeconds: number; acProblems: Set<number> }
    >();
    for (const sub of contestSubmissions) {
      const key = `${sub.contestId}:${sub.userId}`;
      if (!contestMap.has(key)) {
        contestMap.set(key, {
          acCount: 0,
          penaltySeconds: 0,
          acProblems: new Set(),
        });
      }
      const entry = contestMap.get(key)!;
      // status 4 = Accepted (参考旧后端判断逻辑)
      if (sub.status === 4 && !entry.acProblems.has(sub.problemId)) {
        entry.acProblems.add(sub.problemId);
        entry.acCount++;
      }
    }

    let rebuilt = 0;
    for (const [key, entry] of contestMap) {
      const [contestIdStr, userIdStr] = key.split(':');
      await this.rankService.updateContestRank(
        parseInt(contestIdStr),
        parseInt(userIdStr),
        entry.acCount,
        entry.penaltySeconds,
      );
      rebuilt++;
    }

    // 课程排行榜
    const courseSubmissions = await this.submissionRepo
      .createQueryBuilder('s')
      .select(['s.userId', 's.courseId', 's.problemId', 's.status'])
      .where('s.courseId IS NOT NULL')
      .getMany();

    const courseMap = new Map<
      string,
      { acCount: number; acProblems: Set<number> }
    >();
    for (const sub of courseSubmissions) {
      const key = `${sub.courseId}:${sub.userId}`;
      if (!courseMap.has(key)) {
        courseMap.set(key, { acCount: 0, acProblems: new Set() });
      }
      const entry = courseMap.get(key)!;
      if (sub.status === 4 && !entry.acProblems.has(sub.problemId)) {
        entry.acProblems.add(sub.problemId);
        entry.acCount++;
      }
    }

    for (const [key, entry] of courseMap) {
      const [courseIdStr, userIdStr] = key.split(':');
      await this.rankService.updateCourseRank(
        parseInt(courseIdStr),
        parseInt(userIdStr),
        entry.acCount,
        0,
      );
      rebuilt++;
    }

    this.logger.log(`rebuildRankLog: done, rebuilt ${rebuilt} entries`);
    return { rebuilt };
  }

  /**
   * 查询 BullMQ 队列状态
   */
  async getQueueStatus() {
    const counts = await this.judgeTxQueue.getJobCounts();
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
  }

  /**
   * 查询最近 1/5/10 分钟评测完成数
   * 以 submission.updatedAt 为准，status 为终态（非 PENDING/JUDGING/COMPILING）
   */
  async getJudgeStats(): Promise<{
    last1min: number;
    last5min: number;
    last10min: number;
    acLast1min: number;
    acLast5min: number;
    acLast10min: number;
  }> {
    const now = new Date();
    const t1 = new Date(now.getTime() - 1 * 60 * 1000);
    const t5 = new Date(now.getTime() - 5 * 60 * 1000);
    const t10 = new Date(now.getTime() - 10 * 60 * 1000);

    // 终态 status: 0=AC,1=WA,2=TLE,3=MLE,4=CE,5=SE,6=RE,7=PE,8=CRLE,12=OLE,13=SC
    const finalStatuses = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13];

    const countIn = async (since: Date) =>
      this.submissionRepo
        .createQueryBuilder('s')
        .where('s.updatedAt >= :since', { since })
        .andWhere('s.status IN (:...statuses)', { statuses: finalStatuses })
        .getCount();

    const acCountIn = async (since: Date) =>
      this.submissionRepo
        .createQueryBuilder('s')
        .where('s.updatedAt >= :since', { since })
        .andWhere('s.status = 0')
        .getCount();

    const [last1min, last5min, last10min, acLast1min, acLast5min, acLast10min] =
      await Promise.all([
        countIn(t1),
        countIn(t5),
        countIn(t10),
        acCountIn(t1),
        acCountIn(t5),
        acCountIn(t10),
      ]);

    return { last1min, last5min, last10min, acLast1min, acLast5min, acLast10min };
  }
}
