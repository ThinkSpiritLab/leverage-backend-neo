import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { ReceiveService } from './receive.service';
import { RedisService } from '../redis/redis.service';
import { RankService } from '../rank/rank.service';
import {
  JudgeCaseResult,
  JudgeResult,
  JudgeResultKind,
  JudgeState,
  JudgeStateUpdate,
  Status,
} from '../heng/heng.types';
import { Submission } from '../../database/entities/submission.entity';

// Mock DataSource
function createMockManager(
  overrides: Partial<EntityManager> = {},
): Partial<EntityManager> {
  return {
    update: jest.fn().mockResolvedValue({}),
    findOneOrFail: jest.fn().mockResolvedValue({
      id: 1,
      userId: 10,
      problemId: 20,
      contestId: null,
      courseId: null,
    } as Submission),
    findOne: jest.fn().mockResolvedValue(null),
    increment: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    }),
    ...overrides,
  };
}

describe('ReceiveService', () => {
  let service: ReceiveService;
  let mockManager: Partial<EntityManager>;
  let mockDataSource: Partial<DataSource>;
  let mockRedisService: Partial<RedisService>;
  let mockRankService: Partial<RankService>;

  beforeEach(async () => {
    mockManager = createMockManager();
    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (m: EntityManager) => Promise<void>) => {
          await cb(mockManager as EntityManager);
        }),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };
    mockRedisService = {
      set: jest.fn().mockResolvedValue(undefined),
      hget: jest.fn().mockResolvedValue(null),
      hset: jest.fn().mockResolvedValue(1),
    };
    mockRankService = {
      updateContestRank: jest.fn().mockResolvedValue(undefined),
      updateCourseRank: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiveService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
        { provide: RankService, useValue: mockRankService },
      ],
    }).compile();

    service = module.get<ReceiveService>(ReceiveService);
  });

  // ─── calcFinalStatus ──────────────────────────────────────────────────────

  describe('calcFinalStatus', () => {
    it('全部 AC 时返回 Status.AC (0)', () => {
      const result: JudgeResult = {
        cases: [
          { kind: JudgeResultKind.Accepted, time: 100, memory: 1000 },
          { kind: JudgeResultKind.Accepted, time: 150, memory: 1200 },
        ],
      };
      expect(service.calcFinalStatus(result)).toBe(Status.AC);
    });

    it('有 WA 时返回 Status.WA (1)', () => {
      const result: JudgeResult = {
        cases: [
          { kind: JudgeResultKind.Accepted, time: 100, memory: 1000 },
          { kind: JudgeResultKind.WrongAnswer, time: 100, memory: 1000 },
          { kind: JudgeResultKind.Accepted, time: 100, memory: 1000 },
        ],
      };
      expect(service.calcFinalStatus(result)).toBe(Status.WA);
    });

    it('混合多种错误时取最差状态', () => {
      const result: JudgeResult = {
        cases: [
          { kind: JudgeResultKind.Accepted, time: 100, memory: 1000 },
          { kind: JudgeResultKind.TimeLimitExceeded, time: 2000, memory: 1000 },
          { kind: JudgeResultKind.WrongAnswer, time: 100, memory: 1000 },
          { kind: JudgeResultKind.RuntimeError, time: 0, memory: 0 },
        ],
      };
      // RE=6, TLE=2, WA=1 => 最差是 RE
      const finalStatus = service.calcFinalStatus(result);
      expect(finalStatus).toBe(Status.RE);
    });

    it('有 CE 时返回 Status.CE (4)', () => {
      const result: JudgeResult = {
        cases: [{ kind: JudgeResultKind.CompileError, time: 0, memory: 0 }],
      };
      expect(service.calcFinalStatus(result)).toBe(Status.CE);
    });

    it('cases 为空时返回 Status.SE', () => {
      const result: JudgeResult = { cases: [] };
      expect(service.calcFinalStatus(result)).toBe(Status.SE);
    });

    it('SE 应是最差状态', () => {
      const result: JudgeResult = {
        cases: [
          { kind: JudgeResultKind.SystemError, time: 0, memory: 0 },
          { kind: JudgeResultKind.WrongAnswer, time: 0, memory: 0 },
        ],
      };
      expect(service.calcFinalStatus(result)).toBe(Status.SE);
    });
  });

  // ─── receiveUpdate ────────────────────────────────────────────────────────

  describe('receiveUpdate', () => {
    it('应将状态写入 Redis，TTL=300', async () => {
      const stateUpdate: JudgeStateUpdate = { state: JudgeState.Judging };
      await service.receiveUpdate(1, stateUpdate);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'submissionStatus:1',
        Status.JUDGING,
        300,
      );
    });

    it('Confirmed 状态应映射为 PENDING', async () => {
      await service.receiveUpdate(5, { state: JudgeState.Confirmed });
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'submissionStatus:5',
        Status.PENDING,
        300,
      );
    });
  });

  // ─── receiveResult 事务流程 ───────────────────────────────────────────────

  describe('receiveResult', () => {
    const buildResult = (
      kind: JudgeResultKind = JudgeResultKind.Accepted,
    ): JudgeResult => ({
      cases: [{ kind, time: 100, memory: 1000 }],
      judger: 'judger-01',
    });

    it('应调用 manager.update(Submission, ...) 更新状态', async () => {
      await service.receiveResult(1, buildResult());

      expect(mockManager.update).toHaveBeenCalledWith(
        Submission,
        1,
        expect.objectContaining({ status: Status.AC }),
      );
    });

    it('应 await manager.update(SubmissionMisc, ...)', async () => {
      await service.receiveResult(1, buildResult());
      // update 被调用了至少 2 次（Submission + SubmissionMisc）
      expect(
        (mockManager.update as jest.Mock).mock.calls.length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('应 await manager.increment(Problem, ...) 增加 submits', async () => {
      await service.receiveResult(1, buildResult());
      expect(mockManager.increment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 20 }),
        'submits',
        1,
      );
    });

    it('AC 时应 await manager.increment(Problem, ...) 增加 accepts', async () => {
      await service.receiveResult(1, buildResult(JudgeResultKind.Accepted));
      expect(mockManager.increment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 20 }),
        'accepts',
        1,
      );
    });

    it('WA 时不应增加 Problem.accepts', async () => {
      await service.receiveResult(1, buildResult(JudgeResultKind.WrongAnswer));

      const acceptsCalls = (
        mockManager.increment as jest.Mock
      ).mock.calls.filter(
        ([, where, field]) => field === 'accepts' && where?.id === 20,
      );
      expect(acceptsCalls).toHaveLength(0);
    });

    it('应更新 Redis 最终状态', async () => {
      await service.receiveResult(1, buildResult());
      // Redis set 应被调用（submissionStatus 和 ups hash）
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'submissionStatus:1',
        Status.AC,
        300,
      );
    });

    // ─── 首次 AC vs 重复 AC ──────────────────────────────────────────────────

    describe('首次 AC vs 重复 AC', () => {
      it('首次 AC：User.accepts 应 +1', async () => {
        // findOne 返回 null → 没有之前的 AC
        (mockManager.findOne as jest.Mock).mockResolvedValue(null);

        await service.receiveResult(1, buildResult());

        const acceptsUserCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([, where, field]) => field === 'accepts' && where?.id === 10,
        );
        expect(acceptsUserCalls).toHaveLength(1);
      });

      it('重复 AC（有历史 AC）：User.accepts 不再 +1', async () => {
        // findOne 返回之前的 AC submission
        (mockManager.findOne as jest.Mock).mockImplementation(
          (entity, opts) => {
            if (opts?.where?.status === Status.AC) {
              return Promise.resolve({
                id: 999,
                userId: 10,
                problemId: 20,
                status: Status.AC,
              });
            }
            return Promise.resolve(null);
          },
        );

        await service.receiveResult(1, buildResult());

        const acceptsUserCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([, where, field]) => field === 'accepts' && where?.id === 10,
        );
        expect(acceptsUserCalls).toHaveLength(0);
      });
    });

    // ─── 竞赛排行榜 ────────────────────────────────────────────────────────

    describe('竞赛提交', () => {
      beforeEach(() => {
        (mockManager.findOneOrFail as jest.Mock).mockResolvedValue({
          id: 1,
          userId: 10,
          problemId: 20,
          contestId: 100,
          courseId: null,
        } as Submission);
        (mockManager.findOne as jest.Mock).mockImplementation((entity) => {
          // ContestUser 查询返回统计数据
          if (
            entity ===
            require('../../database/entities/contest-user.entity').ContestUser
          ) {
            return Promise.resolve({
              contestId: 100,
              userId: 10,
              accepts: 1,
              submits: 2,
            });
          }
          return Promise.resolve(null);
        });
      });

      it('竞赛 AC 时应调用 rankService.updateContestRank', async () => {
        await service.receiveResult(1, buildResult(JudgeResultKind.Accepted));
        expect(mockRankService.updateContestRank).toHaveBeenCalledWith(
          100,
          10,
          expect.any(Number),
          expect.any(Number),
        );
      });
    });

    // ─── 竞赛提交 WA/CE/SE 场景 ─────────────────────────────────────────────

    describe('竞赛提交 - 非 AC 状态', () => {
      beforeEach(() => {
        (mockManager.findOneOrFail as jest.Mock).mockResolvedValue({
          id: 1,
          userId: 10,
          problemId: 20,
          contestId: 100,
          courseId: null,
        });
        (mockManager.findOne as jest.Mock).mockImplementation((entity: any) => {
          const {
            ContestUser,
          } = require('../../database/entities/contest-user.entity');
          if (entity === ContestUser) {
            return Promise.resolve({
              contestId: 100,
              userId: 10,
              accepts: 0,
              submits: 1,
            });
          }
          return Promise.resolve(null);
        });
      });

      it('竞赛 WA 时应增加 ContestUser.submits，不增加 accepts', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );

        const {
          ContestUser,
        } = require('../../database/entities/contest-user.entity');
        const submitsCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === ContestUser && field === 'submits',
        );
        expect(submitsCalls.length).toBeGreaterThan(0);

        const acceptsCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === ContestUser && field === 'accepts',
        );
        expect(acceptsCalls).toHaveLength(0);
      });

      it('竞赛 WA 时仍应调用 rankService.updateContestRank', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );
        expect(mockRankService.updateContestRank).toHaveBeenCalledWith(
          100,
          10,
          expect.any(Number),
          expect.any(Number),
        );
      });

      it('竞赛 CE 时应跳过全部 ContestUser 更新和排行榜', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.CompileError),
        );

        const {
          ContestUser,
        } = require('../../database/entities/contest-user.entity');
        const contestCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(([entity]: [any]) => entity === ContestUser);
        expect(contestCalls).toHaveLength(0);
        expect(mockRankService.updateContestRank).not.toHaveBeenCalled();
      });

      it('竞赛 SE 时应跳过全部 ContestUser 更新和排行榜', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.SystemError),
        );

        const {
          ContestUser,
        } = require('../../database/entities/contest-user.entity');
        const contestCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(([entity]: [any]) => entity === ContestUser);
        expect(contestCalls).toHaveLength(0);
        expect(mockRankService.updateContestRank).not.toHaveBeenCalled();
      });

      it('ContestUser 不存在时不调用 rankService.updateContestRank', async () => {
        (mockManager.findOne as jest.Mock).mockResolvedValue(null);
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );
        expect(mockRankService.updateContestRank).not.toHaveBeenCalled();
      });
    });

    // ─── 课程提交 ─────────────────────────────────────────────────────────────

    describe('课程提交', () => {
      beforeEach(() => {
        (mockManager.findOneOrFail as jest.Mock).mockResolvedValue({
          id: 1,
          userId: 10,
          problemId: 20,
          contestId: null,
          courseId: 50,
        });
        (mockManager.findOne as jest.Mock).mockImplementation((entity: any) => {
          const {
            CourseUser,
          } = require('../../database/entities/course-user.entity');
          if (entity === CourseUser) {
            return Promise.resolve({
              courseId: 50,
              userId: 10,
              accepts: 0,
              submits: 1,
            });
          }
          return Promise.resolve(null);
        });
      });

      it('课程 WA 时应增加 CourseUser.submits 和 CourseProblem.submits', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );

        const {
          CourseUser,
        } = require('../../database/entities/course-user.entity');

        const {
          CourseProblem,
        } = require('../../database/entities/course-problem.entity');
        const cuSubmits = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === CourseUser && field === 'submits',
        );
        expect(cuSubmits.length).toBeGreaterThan(0);
        const cpSubmits = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === CourseProblem && field === 'submits',
        );
        expect(cpSubmits.length).toBeGreaterThan(0);
      });

      it('课程 WA 时不应增加 CourseUser.accepts', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );

        const {
          CourseUser,
        } = require('../../database/entities/course-user.entity');
        const acceptsCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === CourseUser && field === 'accepts',
        );
        expect(acceptsCalls).toHaveLength(0);
      });

      it('课程首次 AC 时应增加 CourseUser.accepts 和 CourseProblem.accepts', async () => {
        (mockManager.findOne as jest.Mock).mockImplementation((entity: any) => {
          const {
            CourseUser,
          } = require('../../database/entities/course-user.entity');
          if (entity === CourseUser) {
            return Promise.resolve({
              courseId: 50,
              userId: 10,
              accepts: 0,
              submits: 1,
            });
          }
          // No prev AC submission
          return Promise.resolve(null);
        });
        await service.receiveResult(1, buildResult(JudgeResultKind.Accepted));

        const {
          CourseUser,
        } = require('../../database/entities/course-user.entity');

        const {
          CourseProblem,
        } = require('../../database/entities/course-problem.entity');
        const cuAccepts = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === CourseUser && field === 'accepts',
        );
        expect(cuAccepts.length).toBeGreaterThan(0);
        const cpAccepts = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === CourseProblem && field === 'accepts',
        );
        expect(cpAccepts.length).toBeGreaterThan(0);
      });

      it('课程重复 AC 时不应再增加 accepts', async () => {
        (mockManager.findOne as jest.Mock).mockImplementation(
          (entity: any, opts: any) => {
            const {
              CourseUser,
            } = require('../../database/entities/course-user.entity');
            if (entity === CourseUser) {
              return Promise.resolve({
                courseId: 50,
                userId: 10,
                accepts: 1,
                submits: 2,
              });
            }
            // Prev AC submission exists
            if (opts?.where?.status === Status.AC) {
              return Promise.resolve({ id: 999, status: Status.AC });
            }
            return Promise.resolve(null);
          },
        );
        await service.receiveResult(1, buildResult(JudgeResultKind.Accepted));

        const {
          CourseUser,
        } = require('../../database/entities/course-user.entity');
        const cuAccepts = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(
          ([entity, , field]: [any, any, string]) =>
            entity === CourseUser && field === 'accepts',
        );
        expect(cuAccepts).toHaveLength(0);
      });

      it('课程 CE 时应跳过全部 CourseUser 更新', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.CompileError),
        );

        const {
          CourseUser,
        } = require('../../database/entities/course-user.entity');
        const courseCalls = (
          mockManager.increment as jest.Mock
        ).mock.calls.filter(([entity]: [any]) => entity === CourseUser);
        expect(courseCalls).toHaveLength(0);
        expect(mockRankService.updateCourseRank).not.toHaveBeenCalled();
      });

      it('课程 WA 时应调用 rankService.updateCourseRank', async () => {
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );
        expect(mockRankService.updateCourseRank).toHaveBeenCalledWith(
          50,
          10,
          expect.any(Number),
          expect.any(Number),
        );
      });

      it('CourseUser 不存在时不调用 rankService.updateCourseRank', async () => {
        (mockManager.findOne as jest.Mock).mockResolvedValue(null);
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );
        expect(mockRankService.updateCourseRank).not.toHaveBeenCalled();
      });
    });

    // ─── updateUserProblemStatus 条件更新 ──────────────────────────────────

    describe('updateUserProblemStatus - 条件写入', () => {
      it('当前无记录（值=0）时，任何结果都应写入 Redis', async () => {
        (mockRedisService.hget as jest.Mock).mockResolvedValue(null); // current = 0
        await service.receiveResult(
          1,
          buildResult(JudgeResultKind.WrongAnswer),
        );
        // newVal=2 > 0 → hset should be called
        expect(mockRedisService.hset).toHaveBeenCalledWith(
          expect.stringContaining('ups:'),
          expect.any(String),
          2,
        );
      });

      it('已有记录（值=2）时，AC（newVal=1 不大于 2）不应再写入 Redis', async () => {
        (mockRedisService.hget as jest.Mock).mockResolvedValue('2'); // current = 2 (non-AC)
        await service.receiveResult(1, buildResult(JudgeResultKind.Accepted));
        // newVal=1, 1 > 2 is false → hset NOT called
        expect(mockRedisService.hset).not.toHaveBeenCalled();
      });
    });

    // ─── saveSuspicion ─────────────────────────────────────────────────────

    describe('saveSuspicion', () => {
      it('SubmissionMisc 有 code 时应保存 Suspicion', async () => {
        const {
          SubmissionMisc: SM,
        } = require('../../database/entities/submission-misc.entity');
        (mockManager.findOne as jest.Mock).mockImplementation((entity: any) => {
          if (entity === SM) {
            return Promise.resolve({
              submissionId: 1,
              code: 'int main() { return 0; }',
            });
          }
          return Promise.resolve(null);
        });
        await service.receiveResult(1, buildResult());

        const {
          Suspicion: Sus,
        } = require('../../database/entities/suspicion.entity');
        const saveCalls = (mockManager.save as jest.Mock).mock.calls.filter(
          ([entity]: [any]) => entity === Sus,
        );
        expect(saveCalls.length).toBeGreaterThan(0);
      });

      it('saveSuspicion save 失败时主流程不应抛出', async () => {
        const {
          SubmissionMisc: SM,
        } = require('../../database/entities/submission-misc.entity');
        (mockManager.findOne as jest.Mock).mockImplementation((entity: any) => {
          if (entity === SM) {
            return Promise.resolve({ submissionId: 1, code: 'int main() {}' });
          }
          return Promise.resolve(null);
        });
        (mockManager.save as jest.Mock).mockRejectedValue(
          new Error('DB write failed'),
        );
        // Should NOT throw - saveSuspicion has its own try-catch
        await expect(
          service.receiveResult(1, buildResult()),
        ).resolves.toBeUndefined();
      });
    });

    // ─── receiveResult 事务失败回滚 ────────────────────────────────────────

    describe('receiveResult - 事务失败', () => {
      it('事务抛出时应将 Submission 标记为 SE 并重新抛出错误', async () => {
        const transactionError = new Error('transaction failed');
        (mockDataSource.transaction as jest.Mock).mockRejectedValue(
          transactionError,
        );

        const mockExecute = jest.fn().mockResolvedValue({});
        (mockDataSource.createQueryBuilder as jest.Mock).mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: mockExecute,
        });

        await expect(service.receiveResult(1, buildResult())).rejects.toThrow(
          'transaction failed',
        );
        expect(mockExecute).toHaveBeenCalled();
      });
    });
  });
});
