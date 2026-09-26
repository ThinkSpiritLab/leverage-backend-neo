import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Submission } from '../../database/entities/submission.entity';
import { RankService } from '../rank/rank.service';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { TransmitService } from './transmit.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const makeQb = (overrides: Record<string, any> = {}) => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return qb;
};

// ─── 提交记录夹具 ─────────────────────────────────────────────────────────────

const makeSubmission = (overrides: Partial<any> = {}) => ({
  id: 1,
  userId: 42,
  contestId: 1,
  courseId: null,
  problemId: 10,
  status: 4, // Accepted
  createdAt: new Date('2024-01-01T10:00:00Z'),
  ...overrides,
});

// ─── 测试套件 ─────────────────────────────────────────────────────────────────

describe('TransmitService', () => {
  let service: TransmitService;

  let mockSubmissionRepo: any;
  let mockRankService: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockSubmissionRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockRankService = {
      updateContestRank: jest.fn().mockResolvedValue(undefined),
      updateCourseRank: jest.fn().mockResolvedValue(undefined),
    };

    mockQueue = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransmitService,
        {
          provide: getRepositoryToken(Submission),
          useValue: mockSubmissionRepo,
        },
        { provide: RankService, useValue: mockRankService },
        { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<TransmitService>(TransmitService);
  });

  // ─── listJudgers ─────────────────────────────────────────────────────────────

  describe('listJudgers', () => {
    it('does not probe retired external judges; queue status is observed separately', async () => {
      expect(await service.listJudgers()).toEqual([]);
    });
  });

  // ─── refreshTestFiles ────────────────────────────────────────────────────────

  describe('refreshTestFiles', () => {
    it('OSS 未配置时返回消息', () => {
      const result = service.refreshTestFiles();
      expect(result).toEqual({ message: 'OSS not configured' });
    });

    it('同步方法，不 throw', () => {
      expect(() => service.refreshTestFiles()).not.toThrow();
    });
  });

  // ─── rebuildRankLog ──────────────────────────────────────────────────────────

  describe('rebuildRankLog', () => {
    it('没有提交记录时 rebuilt=0', async () => {
      // 竞赛和课程查询都返回空
      const contestQb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      const courseQb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      mockSubmissionRepo.createQueryBuilder
        .mockReturnValueOnce(contestQb)
        .mockReturnValueOnce(courseQb);

      const result = await service.rebuildRankLog();
      expect(result.rebuilt).toBe(0);
      expect(mockRankService.updateContestRank).not.toHaveBeenCalled();
    });

    it('有竞赛提交时应调用 updateContestRank', async () => {
      const contestSubs = [
        makeSubmission({ contestId: 1, userId: 42, problemId: 10, status: 4 }),
        makeSubmission({
          id: 2,
          contestId: 1,
          userId: 42,
          problemId: 11,
          status: 4,
        }), // 同一人第二道
        makeSubmission({
          id: 3,
          contestId: 1,
          userId: 43,
          problemId: 10,
          status: 4,
        }), // 另一个人
      ];
      const contestQb = makeQb({
        getMany: jest.fn().mockResolvedValue(contestSubs),
      });
      const courseQb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      mockSubmissionRepo.createQueryBuilder
        .mockReturnValueOnce(contestQb)
        .mockReturnValueOnce(courseQb);

      const result = await service.rebuildRankLog();
      expect(result.rebuilt).toBe(2); // 2 个 (contestId, userId) 组合
      expect(mockRankService.updateContestRank).toHaveBeenCalledTimes(2);
      expect(mockRankService.updateContestRank).toHaveBeenCalledWith(
        1,
        42,
        2,
        0,
      );
      expect(mockRankService.updateContestRank).toHaveBeenCalledWith(
        1,
        43,
        1,
        0,
      );
    });

    it('有课程提交时应调用 updateCourseRank', async () => {
      const courseSubs = [
        { userId: 42, courseId: 5, problemId: 20, status: 4 },
        { userId: 42, courseId: 5, problemId: 21, status: 4 },
      ];
      const contestQb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      const courseQb = makeQb({
        getMany: jest.fn().mockResolvedValue(courseSubs),
      });
      mockSubmissionRepo.createQueryBuilder
        .mockReturnValueOnce(contestQb)
        .mockReturnValueOnce(courseQb);

      const result = await service.rebuildRankLog();
      expect(result.rebuilt).toBe(1);
      expect(mockRankService.updateCourseRank).toHaveBeenCalledWith(
        5,
        42,
        2,
        0,
      );
    });

    it('重复 AC 同一题不应重复计算', async () => {
      // 同一人 AC 同一题两次
      const contestSubs = [
        makeSubmission({ contestId: 1, userId: 42, problemId: 10, status: 4 }),
        makeSubmission({
          id: 2,
          contestId: 1,
          userId: 42,
          problemId: 10,
          status: 4,
        }), // 重复
      ];
      const contestQb = makeQb({
        getMany: jest.fn().mockResolvedValue(contestSubs),
      });
      const courseQb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      mockSubmissionRepo.createQueryBuilder
        .mockReturnValueOnce(contestQb)
        .mockReturnValueOnce(courseQb);

      await service.rebuildRankLog();
      // acCount 应该是 1，不是 2
      expect(mockRankService.updateContestRank).toHaveBeenCalledWith(
        1,
        42,
        1,
        0,
      );
    });

    it('非 AC 提交不应计入统计', async () => {
      const contestSubs = [
        makeSubmission({ status: 2 }), // Wrong Answer
        makeSubmission({ id: 2, status: 3 }), // Runtime Error
      ];
      const contestQb = makeQb({
        getMany: jest.fn().mockResolvedValue(contestSubs),
      });
      const courseQb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      mockSubmissionRepo.createQueryBuilder
        .mockReturnValueOnce(contestQb)
        .mockReturnValueOnce(courseQb);

      const result = await service.rebuildRankLog();
      // 有条目，但 acCount=0
      expect(result.rebuilt).toBe(1);
      expect(mockRankService.updateContestRank).toHaveBeenCalledWith(
        1,
        42,
        0,
        0,
      );
    });

    it('竞赛和课程同时有数据时 rebuilt 累加', async () => {
      const contestSubs = [
        makeSubmission({ contestId: 1, userId: 42, problemId: 10, status: 4 }),
      ];
      const courseSubs = [
        { userId: 99, courseId: 2, problemId: 30, status: 4 },
      ];
      const contestQb = makeQb({
        getMany: jest.fn().mockResolvedValue(contestSubs),
      });
      const courseQb = makeQb({
        getMany: jest.fn().mockResolvedValue(courseSubs),
      });
      mockSubmissionRepo.createQueryBuilder
        .mockReturnValueOnce(contestQb)
        .mockReturnValueOnce(courseQb);

      const result = await service.rebuildRankLog();
      expect(result.rebuilt).toBe(2);
    });
  });

  // ─── getQueueStatus ──────────────────────────────────────────────────────────

  describe('getQueueStatus', () => {
    it('应返回队列状态', async () => {
      const result = await service.getQueueStatus();
      expect(result).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
      expect(mockQueue.getJobCounts).toHaveBeenCalled();
    });

    it('字段缺失时应 fallback 为 0', async () => {
      mockQueue.getJobCounts.mockResolvedValue({});
      const result = await service.getQueueStatus();
      expect(result.waiting).toBe(0);
      expect(result.active).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.delayed).toBe(0);
    });

    it('应包含所有必要字段', async () => {
      const result = await service.getQueueStatus();
      expect(result).toHaveProperty('waiting');
      expect(result).toHaveProperty('active');
      expect(result).toHaveProperty('completed');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('delayed');
    });
  });
});
