import { Injectable, Logger } from '@nestjs/common'
import { DataSource, EntityManager, Not } from 'typeorm'
import { RedisService } from '../redis/redis.service'
import { RankService } from '../rank/rank.service'
import {
  JudgeCaseResult,
  JudgeResult,
  JudgeResultKind,
  JudgeResultKindToStatus,
  JudgeStateToStatus,
  JudgeStateUpdate,
  Status,
} from '../heng/heng.types'
import { Submission } from '../../database/entities/submission.entity'
import { SubmissionMisc } from '../../database/entities/submission-misc.entity'
import { Suspicion } from '../../database/entities/suspicion.entity'
import { User } from '../../database/entities/user.entity'
import { Problem } from '../../database/entities/problem.entity'
import { ContestUser } from '../../database/entities/contest-user.entity'
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity'
import { CourseUser } from '../../database/entities/course-user.entity'
import { CourseProblem } from '../../database/entities/course-problem.entity'

/** Redis key TTL（秒）：供前端轮询提交状态 */
const SUBMISSION_STATUS_TTL_SECS = 300

/**
 * ReceiveService
 *
 * 处理来自 heng-controller 的评测结果：
 * - receiveUpdate: 更新中间状态到 Redis（供前端轮询）
 * - receiveResult: 在单个事务中完成所有 DB 更新 + Redis 排行榜
 */
@Injectable()
export class ReceiveService {
  private readonly logger = new Logger(ReceiveService.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly rankService: RankService,
  ) {}

  /**
   * 接收中间状态更新
   * 将状态写入 Redis（TTL=300s），供前端轮询获取实时状态
   */
  async receiveUpdate(submissionId: number, stateUpdate: JudgeStateUpdate): Promise<void> {
    const status = JudgeStateToStatus[stateUpdate.state]
    await this.redisService.set(
      `submissionStatus:${submissionId}`,
      status,
      SUBMISSION_STATUS_TTL_SECS,
    )
  }

  /**
   * 接收最终评测结果
   *
   * 在单个事务中完成：
   * 1. 计算最终状态（所有 case 取最差）
   * 2. 更新 Submission（status/time/memory/judger）
   * 3. 更新 SubmissionMisc（judgeResult/compileErrorMsg）
   * 4. 更新 Problem 统计（submits/accepts）
   * 5. 更新 User 统计（首次 AC 才计）
   * 6. 保存 Suspicion
   * 7. 更新 UserProblemStatus Redis Hash 缓存
   * 8. 竞赛提交：更新 ContestUser/ContestUserProblem + Redis 排行榜
   * 9. 课程提交：更新 CourseUser/CourseProblem
   */
  async receiveResult(submissionId: number, result: JudgeResult): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        // 1. 计算最终状态
        const finalStatus = this.calcFinalStatus(result)

        // 2. 更新 Submission 核心字段
        const totalTime = result.cases.reduce((sum, c) => sum + (c.time ?? 0), 0)
        const maxMemory = result.cases.reduce((max, c) => Math.max(max, c.memory ?? 0), 0)

        await manager.update(Submission, submissionId, {
          status: finalStatus,
          time: totalTime,
          memory: maxMemory,
          judger: result.judger ?? null,
        })

        // 3. 更新 SubmissionMisc（judgeResult + compileError）
        await manager.update(
          SubmissionMisc,
          { submissionId },
          {
            judgeResult: JSON.stringify(result.cases),
            compileErrorMsg: result.extra?.user?.compileMessage ?? '',
          },
        )

        // 4. 查 Submission 获取 userId, problemId, contestId, courseId
        const submission = await manager.findOneOrFail(Submission, {
          where: { id: submissionId },
        })

        // 5. 更新 Problem 统计（submits 无条件+1，AC 时 accepts+1）
        await manager.increment(Problem, { id: submission.problemId }, 'submits', 1)
        if (finalStatus === Status.AC) {
          await manager.increment(Problem, { id: submission.problemId }, 'accepts', 1)
        }

        // 6. 更新 User 统计（submits 无条件+1，首次 AC 才计入 accepts）
        await manager.increment(User, { id: submission.userId }, 'submits', 1)
        if (finalStatus === Status.AC) {
          const prevAc = await manager.findOne(Submission, {
            where: {
              userId: submission.userId,
              problemId: submission.problemId,
              status: Status.AC,
              id: Not(submissionId),
            },
          })
          if (!prevAc) {
            await manager.increment(User, { id: submission.userId }, 'accepts', 1)
          }
        }

        // 7. 保存 Suspicion（代码查重指标）
        await this.saveSuspicion(manager, submissionId)

        // 8. 更新 UserProblemStatus Redis Hash 缓存
        await this.updateUserProblemStatus(
          submission.userId,
          submission.problemId,
          finalStatus,
          submission.courseId,
          submission.contestId,
        )

        // 9. 更新 Redis 最终状态（供前端轮询）
        await this.redisService.set(
          `submissionStatus:${submissionId}`,
          finalStatus,
          SUBMISSION_STATUS_TTL_SECS,
        )

        // 10. 竞赛提交
        if (submission.contestId != null) {
          await this.handleContestResult(manager, submission, finalStatus)
        }

        // 11. 课程提交
        if (submission.courseId != null) {
          await this.handleCourseResult(manager, submission, finalStatus)
        }
      })
    } catch (err) {
      this.logger.error(`receiveResult failed for submissionId=${submissionId}`, err)
      // 事务失败时将状态标记为 SE，保证前端不会永久 pending
      await this.dataSource
        .createQueryBuilder()
        .update(Submission)
        .set({ status: Status.SE })
        .where('id = :id', { id: submissionId })
        .execute()
        .catch(() => {})
      throw err
    }
  }

  /**
   * 计算最终状态：对所有 case 取最差（reduce OR）
   *
   * Status 数值越小越好（AC=0 是最好），所以取数值最大的状态。
   * CE/SE 等 > RE > WA/TLE/MLE > AC
   */
  calcFinalStatus(result: JudgeResult): Status {
    if (!result.cases || result.cases.length === 0) {
      return Status.SE
    }
    return result.cases.reduce((worst: Status, c: JudgeCaseResult) => {
      const caseStatus = JudgeResultKindToStatus[c.kind] ?? Status.SE
      return caseStatus > worst ? caseStatus : worst
    }, Status.AC)
  }

  /**
   * 更新 UserProblemStatus Redis Hash 缓存
   * key: ups:{userId}:{courseId|contestId|global}
   * field: {problemId}
   * value: status（1=AC, 2=attempted，优先保留 AC）
   */
  private async updateUserProblemStatus(
    userId: number,
    problemId: number,
    finalStatus: Status,
    courseId: number | null,
    contestId: number | null,
  ): Promise<void> {
    const scope = courseId ?? contestId ?? 'global'
    const key = `ups:${userId}:${scope}`

    const current = await this.redisService.hget(key, String(problemId))
    const currentVal = current ? parseInt(current) : 0

    // 1=AC（最好）, 2=attempted；已经 AC 就不降级
    const newVal = finalStatus === Status.AC ? 1 : 2
    if (newVal > currentVal) {
      await this.redisService.hset(key, String(problemId), newVal)
    }
  }

  /**
   * 竞赛结果处理：
   * - 更新 ContestUser 统计
   * - 记录 ContestUserProblem（AC 时）
   * - Redis Sorted Set 实时更新排行榜
   */
  private async handleContestResult(
    manager: EntityManager,
    submission: Submission,
    finalStatus: Status,
  ): Promise<void> {
    const { userId, problemId } = submission
    const contestId = submission.contestId as number // 调用方已确保 contestId != null

    // 跳过 CE/SE（与原始代码一致）
    if (finalStatus === Status.CE || finalStatus === Status.SE) return

    // 更新 ContestUser 统计
    await manager.increment(ContestUser, { contestId, userId }, 'submits', 1)
    if (finalStatus === Status.AC) {
      await manager.increment(ContestUser, { contestId, userId }, 'accepts', 1)

      // 记录 ContestUserProblem（AC 标记，允许重复 AC 不报错）
      await manager
        .createQueryBuilder()
        .insert()
        .into(ContestUserProblem)
        .values({
          contestId,
          contestUserId: userId,
          contestProblemId: problemId,
        })
        .orIgnore()
        .execute()
    }

    // 更新 Redis 排行榜
    await this.refreshContestRank(manager, contestId, userId)
  }

  /**
   * 重新计算并更新竞赛 Redis 排行榜
   * Score = AC 数 * 1e9 - 罚时秒数
   */
  private async refreshContestRank(
    manager: EntityManager,
    contestId: number,
    userId: number,
  ): Promise<void> {
    const contestUser = await manager.findOne(ContestUser, {
      where: { contestId, userId },
    })
    if (!contestUser) return

    const acCount = contestUser.accepts ?? 0
    // 罚时：WA 次数 * 1200s（标准 ICPC 罚时规则，可按需调整）
    const waCount = (contestUser.submits ?? 0) - acCount
    const penaltySeconds = waCount * 1200

    await this.rankService.updateContestRank(contestId, userId, acCount, penaltySeconds)
  }

  /**
   * 课程结果处理：更新 CourseUser/CourseProblem 统计
   */
  private async handleCourseResult(
    manager: EntityManager,
    submission: Submission,
    finalStatus: Status,
  ): Promise<void> {
    const { userId, problemId } = submission
    const courseId = submission.courseId as number // 调用方已确保 courseId != null

    // 跳过 CE/SE
    if (finalStatus === Status.CE || finalStatus === Status.SE) return

    await manager.increment(CourseUser, { courseId, userId }, 'submits', 1)
    await manager.increment(CourseProblem, { courseId, problemId }, 'submits', 1)

    if (finalStatus === Status.AC) {
      // 首次 AC 才计入 CourseUser.accepts
      const prevAc = await manager.findOne(Submission, {
        where: {
          userId,
          problemId,
          courseId: courseId as number | undefined,
          status: Status.AC,
          id: Not(submission.id),
        },
      })
      if (!prevAc) {
        await manager.increment(CourseUser, { courseId, userId }, 'accepts', 1)
        await manager.increment(CourseProblem, { courseId, problemId }, 'accepts', 1)
      }
    }

    // 更新课程排行榜
    const courseUser = await manager.findOne(CourseUser, { where: { courseId, userId } })
    if (courseUser) {
      const acCount = courseUser.accepts ?? 0
      const penaltySeconds = ((courseUser.submits ?? 0) - acCount) * 1200
      await this.rankService.updateCourseRank(courseId!, userId, acCount, penaltySeconds)
    }
  }

  /**
   * 保存 Suspicion 查重指标
   * Suspicion 实体已有静态 check 方法，从 SubmissionMisc.code 计算
   */
  private async saveSuspicion(
    manager: EntityManager,
    submissionId: number,
  ): Promise<void> {
    try {
      const misc = await manager.findOne(SubmissionMisc, { where: { submissionId } })
      if (!misc?.code) return

      const suspicion = new Suspicion()
      suspicion.submissionId = submissionId

      // 使用 SubmissionMisc.code 计算各查重指标
      const code = misc.code
      suspicion.hashsum = require('crypto')
        .createHash('sha256')
        .update(code)
        .digest('hex')
        .slice(0, 100)

      await manager.save(Suspicion, suspicion)
    } catch (err) {
      // 查重计算失败不影响主流程
      this.logger.warn(`Suspicion save failed for submissionId=${submissionId}: ${err}`)
    }
  }
}
