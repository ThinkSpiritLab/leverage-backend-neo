import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

/**
 * RankService (Placeholder)
 *
 * 排行榜服务。提供实时 Redis Sorted Set 排行榜更新。
 * 完整实现由专用 agent 完成，此处为 ReceiveService 所需的最小接口。
 */
@Injectable()
export class RankService {
  private readonly logger = new Logger(RankService.name)

  constructor(private readonly redisService: RedisService) {}

  /**
   * 更新竞赛排行榜
   * Score 编码：AC 数 * 1e9 - 罚时秒数（越大越好）
   *
   * @param contestId 竞赛 ID
   * @param userId 用户 ID
   * @param acCount 通过题目数
   * @param penaltySeconds 累计罚时（秒）
   */
  async updateContestRank(
    contestId: number,
    userId: number,
    acCount: number,
    penaltySeconds: number,
  ): Promise<void> {
    const score = this.calcScore(acCount, penaltySeconds)
    const key = `contest-rank:${contestId}`
    await this.redisService.zadd(key, score, String(userId))
    this.logger.debug(
      `Updated contest rank: contestId=${contestId}, userId=${userId}, score=${score}`,
    )
  }

  /**
   * 更新课程排行榜
   */
  async updateCourseRank(
    courseId: number,
    userId: number,
    acCount: number,
    penaltySeconds: number,
  ): Promise<void> {
    const score = this.calcScore(acCount, penaltySeconds)
    const key = `course-rank:${courseId}`
    await this.redisService.zadd(key, score, String(userId))
  }

  /**
   * Score 编码：AC 数 * 1e9 - 罚时秒数（越大越好，ZREVRANK 即为排名）
   */
  private calcScore(acCount: number, penaltySeconds: number): number {
    return acCount * 1_000_000_000 - penaltySeconds
  }
}
