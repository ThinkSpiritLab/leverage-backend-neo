import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { RedisService } from '../redis/redis.service';
import { RankService } from '../rank/rank.service';
import { Status } from '../heng/heng.types';
import { Problem } from '../../database/entities/problem.entity';
import { User } from '../../database/entities/user.entity';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity';
import { CourseUser } from '../../database/entities/course-user.entity';
import { CourseProblem } from '../../database/entities/course-problem.entity';
import { PollResult } from '../judge-provider/judge-provider.interface';

const SUBMISSION_STATUS_TTL_SECS = 300;

/**
 * BotzoneResultService
 *
 * Handles the finalization of a botzone submission result.
 * Mirrors the logic of ReceiveService.receiveResult but for botzone payloads.
 * Supports idempotency: if the submission is already in a terminal state,
 * it is a no-op.
 */
@Injectable()
export class BotzoneResultService {
  private readonly logger = new Logger(BotzoneResultService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    private readonly redisService: RedisService,
    private readonly rankService: RankService,
  ) {}

  /**
   * Finalize a botzone submission.
   * Idempotent: skips if already in a terminal state.
   */
  async finalize(submissionId: number, result: PollResult): Promise<void> {
    // Idempotency check: if already in a terminal state, skip
    const existing = await this.submissionRepo.findOne({
      where: { id: submissionId },
      select: ['id', 'status', 'provider'] as (keyof Submission)[],
    });
    if (!existing) {
      this.logger.warn(
        `BotzoneResultService.finalize: submission ${submissionId} not found`,
      );
      return;
    }

    const alreadyTerminal = this.isTerminalStatus(existing.status);
    if (alreadyTerminal) {
      this.logger.debug(
        `BotzoneResultService.finalize: submission ${submissionId} already in terminal state ${existing.status}, skipping`,
      );
      return;
    }

    const finalStatus = result.status ?? Status.SE;

    try {
      await this.dataSource.transaction(async (manager) => {
        // 1. Update Submission
        const submissionUpdate: Partial<Submission> = {
          status: finalStatus,
          time: result.time ?? undefined,
          memory: result.memory ?? undefined,
          judger: 'botzone',
        };
        // Merge providerMeta if present (e.g. gameLog for botzone matches)
        if (result.providerMeta && Object.keys(result.providerMeta).length > 0) {
          submissionUpdate.providerMeta = JSON.stringify(result.providerMeta);
        }
        await manager.update(Submission, submissionId, submissionUpdate);

        // 2. Update SubmissionMisc
        await manager.update(
          SubmissionMisc,
          { submissionId },
          {
            judgeResult: result.judgeResult ?? undefined,
            compileErrorMsg: result.compileErrorMsg ?? '',
          },
        );

        // 3. Load full submission for stats
        const submission = await manager.findOneOrFail(Submission, {
          where: { id: submissionId },
        });

        // 4. Update Problem stats
        await manager.increment(
          Problem,
          { id: submission.problemId },
          'submits',
          1,
        );
        if (finalStatus === Status.AC) {
          await manager.increment(
            Problem,
            { id: submission.problemId },
            'accepts',
            1,
          );
        }

        // 5. Update User stats (first AC only)
        await manager.increment(User, { id: submission.userId }, 'submits', 1);
        if (finalStatus === Status.AC) {
          const prevAc = await manager.findOne(Submission, {
            where: {
              userId: submission.userId,
              problemId: submission.problemId,
              status: Status.AC,
              id: Not(submissionId),
            },
          });
          if (!prevAc) {
            await manager.increment(
              User,
              { id: submission.userId },
              'accepts',
              1,
            );
          }
        }

        // 6. Redis status cache
        await this.redisService.set(
          `submissionStatus:${submissionId}`,
          finalStatus,
          SUBMISSION_STATUS_TTL_SECS,
        );

        // 7. Contest result
        if (submission.contestId != null) {
          await this.handleContestResult(manager, submission, finalStatus);
        }

        // 8. Course result
        if (submission.courseId != null) {
          await this.handleCourseResult(manager, submission, finalStatus);
        }
      });

      this.logger.log(
        `Botzone result finalized: submissionId=${submissionId}, status=${finalStatus}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to finalize botzone result for submissionId=${submissionId}`,
        err,
      );
      await this.dataSource
        .createQueryBuilder()
        .update(Submission)
        .set({ status: Status.SE })
        .where('id = :id', { id: submissionId })
        .execute()
        .catch(() => {});
      throw err;
    }
  }

  private isTerminalStatus(status: number): boolean {
    const nonTerminal = new Set([Status.PENDING, Status.JUDGING, Status.COMPILING]);
    return !nonTerminal.has(status);
  }

  private async handleContestResult(
    manager: import('typeorm').EntityManager,
    submission: Submission,
    finalStatus: Status,
  ): Promise<void> {
    const { userId, problemId } = submission;
    const contestId = submission.contestId as number;
    if (finalStatus === Status.CE || finalStatus === Status.SE) return;

    await manager.increment(ContestUser, { contestId, userId }, 'submits', 1);
    if (finalStatus === Status.AC) {
      await manager.increment(ContestUser, { contestId, userId }, 'accepts', 1);
      await manager
        .createQueryBuilder()
        .insert()
        .into(ContestUserProblem)
        .values({ contestId, contestUserId: userId, contestProblemId: problemId })
        .orIgnore()
        .execute();
    }

    const contestUser = await manager.findOne(ContestUser, {
      where: { contestId, userId },
    });
    if (contestUser) {
      const acCount = contestUser.accepts ?? 0;
      const penaltySeconds = ((contestUser.submits ?? 0) - acCount) * 1200;
      await this.rankService.updateContestRank(contestId, userId, acCount, penaltySeconds);
    }
  }

  private async handleCourseResult(
    manager: import('typeorm').EntityManager,
    submission: Submission,
    finalStatus: Status,
  ): Promise<void> {
    const { userId, problemId } = submission;
    const courseId = submission.courseId as number;
    if (finalStatus === Status.CE || finalStatus === Status.SE) return;

    await manager.increment(CourseUser, { courseId, userId }, 'submits', 1);
    await manager.increment(CourseProblem, { courseId, problemId }, 'submits', 1);

    if (finalStatus === Status.AC) {
      const prevAc = await manager.findOne(Submission, {
        where: {
          userId,
          problemId,
          courseId: courseId as number | undefined,
          status: Status.AC,
          id: Not(submission.id),
        },
      });
      if (!prevAc) {
        await manager.increment(CourseUser, { courseId, userId }, 'accepts', 1);
        await manager.increment(CourseProblem, { courseId, problemId }, 'accepts', 1);
      }
    }

    const courseUser = await manager.findOne(CourseUser, {
      where: { courseId, userId },
    });
    if (courseUser) {
      const acCount = courseUser.accepts ?? 0;
      const penaltySeconds = ((courseUser.submits ?? 0) - acCount) * 1200;
      await this.rankService.updateCourseRank(courseId, userId, acCount, penaltySeconds);
    }
  }
}
