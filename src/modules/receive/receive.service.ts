import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Not } from 'typeorm';
import { RankService } from '../rank/rank.service';
import {
  JudgeResult,
  JudgeResultKindToStatus,
  JudgeStateToStatus,
  JudgeStateUpdate,
  Status,
} from '../heng/heng.types';
import { PollResult } from '../judge-provider/judge-provider.interface';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { Suspicion } from '../../database/entities/suspicion.entity';
import { User } from '../../database/entities/user.entity';
import { Problem } from '../../database/entities/problem.entity';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity';
import { CourseUser } from '../../database/entities/course-user.entity';
import { CourseProblem } from '../../database/entities/course-problem.entity';

const pendingStatuses = [Status.PENDING, Status.JUDGING, Status.COMPILING];
export interface JudgeIdentity {
  provider: 'heng' | 'botzone';
  attemptId?: string;
  jobId?: string;
}

/** Both providers normalize results here. SQL owns status and accounting. */
@Injectable()
export class ReceiveService {
  constructor(
    private readonly dataSource: DataSource,

    private readonly rankService: RankService,
  ) {}

  async receiveUpdate(
    submissionId: number,
    update: JudgeStateUpdate,
    attemptId?: string,
  ): Promise<void> {
    const status = JudgeStateToStatus[update.state];
    if (status === undefined)
      throw new BadRequestException('Invalid judge state');
    // The same locked row governs progress, completion and rejudging. No second
    // status cache can outlive a rollback or overwrite a newer attempt.
    await this.dataSource.transaction(async (manager) => {
      const submission = await manager.findOneOrFail(Submission, {
        where: { id: submissionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !this.matches(submission, { provider: 'heng', attemptId }) ||
        !pendingStatuses.includes(submission.status)
      )
        return;
      await manager.update(Submission, submissionId, { status });
    });
  }

  async receiveResult(
    submissionId: number,
    result: JudgeResult,
    attemptId?: string,
  ): Promise<void> {
    if (!Array.isArray(result.cases))
      throw new BadRequestException('Invalid judge cases');
    await this.finalize(
      submissionId,
      {
        done: true,
        status: this.calcFinalStatus(result),
        time: result.cases.reduce((sum, c) => sum + (c.time ?? 0), 0),
        memory: result.cases.reduce(
          (max, c) => Math.max(max, c.memory ?? 0),
          0,
        ),
        judgeResult: JSON.stringify(result.cases),
        compileErrorMsg: result.extra?.user?.compileMessage ?? '',
      },
      { provider: 'heng', attemptId },
      result.judger ?? null,
    );
  }

  calcFinalStatus(result: JudgeResult): Status {
    if (!result.cases?.length) return Status.SE;
    return result.cases.reduce(
      (worst, c) =>
        Math.max(worst, JudgeResultKindToStatus[c.kind] ?? Status.SE),
      Status.AC,
    );
  }

  async finalize(
    submissionId: number,
    result: PollResult,
    identity: JudgeIdentity,
    judger: string | null = identity.provider,
  ): Promise<void> {
    const status = result.status ?? Status.SE;
    if (
      !result.done ||
      !Number.isInteger(status) ||
      pendingStatuses.includes(status)
    ) {
      throw new BadRequestException('A terminal judge result is required');
    }
    const finalized = await this.dataSource.transaction(async (manager) => {
      const submission = await manager.findOneOrFail(Submission, {
        where: { id: submissionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!this.matches(submission, identity)) return null;
      if (!pendingStatuses.includes(submission.status)) return submission;

      // Serialize this user's first-AC accounting across distinct submissions.
      await manager.findOneOrFail(User, {
        where: { id: submission.userId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.updateStatistics(manager, submission, status);
      await manager.update(Submission, submissionId, {
        status,
        judgedStatus: status,
        time: result.time ?? 0,
        memory: result.memory ?? 0,
        judger,
        ...(result.providerMeta
          ? { providerMeta: JSON.stringify(result.providerMeta) }
          : {}),
      });
      await manager.update(
        SubmissionMisc,
        { submissionId },
        {
          judgeResult: result.judgeResult ?? '',
          compileErrorMsg: result.compileErrorMsg ?? '',
        },
      );
      const misc = await manager.findOne(SubmissionMisc, {
        where: { submissionId },
      });
      if (misc?.code) {
        await manager.save(Suspicion, {
          submissionId,
          hashsum: createHash('sha256').update(misc.code).digest('hex'),
        });
      }
      return submission;
    });
    // A failed commit has no Redis effects. A retry after commit skips accounting
    // but retries rank publication, so a transient Redis failure is recoverable.
    if (finalized) await this.publishRanks(finalized);
  }

  private matches(submission: Submission, identity: JudgeIdentity): boolean {
    if ((submission.provider ?? 'heng') !== identity.provider) return false;
    if (
      submission.judgeAttempt &&
      submission.judgeAttempt !== identity.attemptId
    )
      return false;
    if (identity.provider === 'botzone') {
      // New callbacks carry the attempt in their URL, even if they beat the
      // enqueue HTTP response. Legacy callbacks must match the saved job ID.
      if (
        !identity.attemptId &&
        (!identity.jobId || identity.jobId !== submission.externalJobId)
      )
        return false;
      if (
        submission.externalJobId &&
        identity.jobId &&
        identity.jobId !== submission.externalJobId
      )
        return false;
    }
    return true;
  }

  private async updateStatistics(
    manager: EntityManager,
    s: Submission,
    status: Status,
  ): Promise<void> {
    const previous = s.judgedStatus ?? null;
    const first = previous === null ? 1 : 0;
    const acDelta =
      Number(status === Status.AC) - Number(previous === Status.AC);
    if (first) {
      await manager.increment(Problem, { id: s.problemId }, 'submits', first);
      await manager.increment(User, { id: s.userId }, 'submits', first);
    }
    if (acDelta) {
      await manager.increment(Problem, { id: s.problemId }, 'accepts', acDelta);
      if (!(await this.otherAccepted(manager, s))) {
        await manager.increment(User, { id: s.userId }, 'accepts', acDelta);
      }
    }

    // Preserve the existing CE/SE exclusion and penalty policy. Fix distinct
    // solved counts and rejudge deltas without redefining contest scoring.
    const eligible = (value: number | null) =>
      value != null && ![Status.CE, Status.SE].includes(value);
    const submitDelta = Number(eligible(status)) - Number(eligible(previous));
    if (s.contestId != null) {
      const where = { contestId: s.contestId, userId: s.userId };
      if (submitDelta)
        await manager.increment(ContestUser, where, 'submits', submitDelta);
      if (
        acDelta &&
        !(await this.otherAccepted(manager, s, { contestId: s.contestId }))
      ) {
        await manager.increment(ContestUser, where, 'accepts', acDelta);
        const accepted = {
          contestId: s.contestId,
          contestUserId: s.userId,
          contestProblemId: s.problemId,
        };
        if (status === Status.AC) {
          await manager
            .createQueryBuilder()
            .insert()
            .into(ContestUserProblem)
            .values(accepted)
            .orIgnore()
            .execute();
        } else {
          await manager.delete(ContestUserProblem, accepted);
        }
      }
    }
    if (s.courseId != null) {
      const user = { courseId: s.courseId, userId: s.userId };
      const problem = { courseId: s.courseId, problemId: s.problemId };
      if (submitDelta) {
        await manager.increment(CourseUser, user, 'submits', submitDelta);
        await manager.increment(CourseProblem, problem, 'submits', submitDelta);
      }
      if (
        acDelta &&
        !(await this.otherAccepted(manager, s, { courseId: s.courseId }))
      ) {
        await manager.increment(CourseUser, user, 'accepts', acDelta);
        await manager.increment(CourseProblem, problem, 'accepts', acDelta);
      }
    }
  }

  private otherAccepted(
    manager: EntityManager,
    s: Submission,
    scope: { contestId?: number; courseId?: number } = {},
  ) {
    return manager.findOne(Submission, {
      where: {
        userId: s.userId,
        problemId: s.problemId,
        judgedStatus: Status.AC,
        id: Not(s.id),
        ...scope,
      },
      select: ['id'],
    });
  }

  private async publishRanks(s: Submission): Promise<void> {
    if (s.contestId != null) {
      const user = await this.dataSource
        .getRepository(ContestUser)
        .findOne({ where: { contestId: s.contestId, userId: s.userId } });
      if (user)
        await this.rankService.updateContestRank(
          s.contestId,
          s.userId,
          user.accepts,
          (user.submits - user.accepts) * 1200,
        );
    }
    if (s.courseId != null) {
      const user = await this.dataSource
        .getRepository(CourseUser)
        .findOne({ where: { courseId: s.courseId, userId: s.userId } });
      if (user)
        await this.rankService.updateCourseRank(
          s.courseId,
          s.userId,
          user.accepts,
          (user.submits - user.accepts) * 1200,
        );
    }
  }
}
