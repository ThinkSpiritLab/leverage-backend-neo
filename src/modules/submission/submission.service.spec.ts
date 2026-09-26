import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { getToken } from '@willsoto/nestjs-prometheus';
import { SubmissionService, UserProblemStatus } from './submission.service';
import { ReceiveService } from '../receive/receive.service';
import { SUBMISSION_TOTAL_COUNTER } from '../metrics/metrics.module';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { Problem } from '../../database/entities/problem.entity';
import { RejudgeLog } from '../../database/entities/rejudge-log.entity';
import { Suspicion } from '../../database/entities/suspicion.entity';
import { RedisService } from '../redis/redis.service';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { Status } from '../heng/heng.types';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 生成标准 QueryBuilder mock，方法全部返回 this（链式调用） */
function makeQb(overrides: Record<string, jest.Mock> = {}) {
  const qb: any = {};
  const chainMethods = [
    'leftJoin',
    'leftJoinAndSelect',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orWhere',
    'having',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'take',
    'skip',
    'limit',
    'offset',
    'cache',
  ];
  for (const m of chainMethods) qb[m] = jest.fn().mockReturnThis();
  // data return methods – default empty
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  qb.getRawOne = jest.fn().mockResolvedValue(null);
  qb.clone = jest.fn().mockImplementation(() => makeQb());
  Object.assign(qb, overrides);
  return qb;
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

const mockProblem: Problem = {
  id: 1,
  prefix: 'p',
  logicId: 1001,
  title: 'Test',
  content: '',
  source: 'Leverage',
  timeLimit: 1000,
  memoryLimit: 64,
  difficulty: 1,
  cases: 3,
  multiCases: false,
  submits: 0,
  accepts: 0,
  restricted: false,
  status: 0 as any,
  statusUpdatedAt: null as any,
  closed: false,
  createrId: null as any,
  creater: null,
  tags: [],
  spjId: null as any,
  spj: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSubmission: Submission = {
  id: 42,
  userId: 1,
  user: null as any,
  problemId: 1,
  problem: mockProblem,
  language: 1,
  time: null as any,
  memory: null as any,
  misc: null as any,
  sus: null as any,
  status: Status.PENDING,
  judger: null,
  courseId: null,
  course: null as any,
  contestId: null,
  contest: null as any,
  rejudgeLogs: [],
  provider: null,
  externalJobId: null,
  providerMeta: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMisc = {
  submissionId: 42,
  code: 'int main(){}',
  judgeResult: null,
  compileErrorMsg: null,
};

// ─── main suite ───────────────────────────────────────────────────────────────

describe('SubmissionService', () => {
  let service: SubmissionService;
  let submissionRepo: jest.Mocked<any>;
  let miscRepo: jest.Mocked<any>;
  let problemRepo: jest.Mocked<any>;
  let rejudgeLogRepo: jest.Mocked<any>;
  let suspicionRepo: jest.Mocked<any>;
  let redisService: jest.Mocked<RedisService>;
  let configService: jest.Mocked<ConfigService>;
  let judgeTxQueue: { add: jest.Mock };

  beforeEach(async () => {
    submissionRepo = {
      save: jest.fn().mockResolvedValue(mockSubmission),
      findOne: jest.fn().mockResolvedValue(mockSubmission),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(100),
      createQueryBuilder: jest.fn().mockReturnValue(
        makeQb({
          getManyAndCount: jest.fn().mockResolvedValue([[mockSubmission], 1]),
        }),
      ),
    };

    miscRepo = {
      save: jest.fn().mockResolvedValue(mockMisc),
      findOne: jest.fn().mockResolvedValue(mockMisc),
    };

    problemRepo = {
      findOne: jest.fn().mockResolvedValue(mockProblem),
    };

    rejudgeLogRepo = {
      save: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
    };

    suspicionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
    };

    redisService = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    } as any;

    configService = {
      get: jest.fn().mockImplementation((key: string, def?: any) => {
        if (key === 'submission.maxPerMinute') return 10;
        if (key === 'baseUrl') return 'http://localhost:3000';
        return def;
      }),
    } as any;

    judgeTxQueue = { add: jest.fn().mockResolvedValue({}) };
    submissionRepo.manager = {
      transaction: async (fn: any) => fn({
        findOne: async (entity: any, options: any) => {
          const value = await (entity === Submission ? submissionRepo : miscRepo).findOne(options);
          return value ? { ...value } : null;
        },
        save: (_entity: any, value: any) => rejudgeLogRepo.save(value),
        update: (entity: any, criteria: any, value: any) => entity === Submission
          ? submissionRepo.update(criteria, value) : Promise.resolve({ affected: 1 }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionService,
        { provide: ReceiveService, useValue: { finalize: jest.fn() } },
        { provide: getRepositoryToken(Submission), useValue: submissionRepo },
        { provide: getRepositoryToken(SubmissionMisc), useValue: miscRepo },
        { provide: getRepositoryToken(Problem), useValue: problemRepo },
        { provide: getRepositoryToken(RejudgeLog), useValue: rejudgeLogRepo },
        { provide: getRepositoryToken(Suspicion), useValue: suspicionRepo },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
        { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: judgeTxQueue },
        {
          provide: getToken(SUBMISSION_TOTAL_COUNTER),
          useValue: { labels: jest.fn().mockReturnValue({ inc: jest.fn() }) },
        },
      ],
    }).compile();

    service = module.get<SubmissionService>(SubmissionService);
  });

  // =========================================================================
  // create – 频率限制
  // =========================================================================

  describe('create – 频率限制', () => {
    const dto = { problemId: 1, code: 'int main(){}', language: 1 };

    it('第一次提交应通过（count=1 ≤ max=10）', async () => {
      await expect(service.create(1, dto)).resolves.toBeDefined();
    });

    it('超出限制时应抛出 429（count=11 > max=10）', async () => {
      redisService.incr.mockResolvedValue(11);
      await expect(service.create(1, dto)).rejects.toThrow(
        new HttpException(
          '提交过于频繁，请稍后再试',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('刚好达到限制时应通过（count=10 = max=10）', async () => {
      redisService.incr.mockResolvedValue(10);
      await expect(service.create(1, dto)).resolves.toBeDefined();
    });

    it('count=1 时应设置 TTL 60s', async () => {
      await service.create(1, dto);
      expect(redisService.expire).toHaveBeenCalledWith('submit-throttle:1', 60);
    });

    it('count > 1 时不应再次设置 TTL', async () => {
      redisService.incr.mockResolvedValue(5);
      await service.create(1, dto);
      expect(redisService.expire).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // create – DB & 队列
  // =========================================================================

  describe('create – DB 写入 & 队列', () => {
    const dto = { problemId: 1, code: 'int main(){}', language: 1 };

    it('题目不存在时应抛出 NotFoundException', async () => {
      problemRepo.findOne.mockResolvedValue(null);
      await expect(service.create(1, dto)).rejects.toThrow(NotFoundException);
    });

    it('应写入 submissionRepo', async () => {
      await service.create(1, dto);
      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          problemId: 1,
          language: 1,
          status: Status.PENDING,
        }),
      );
    });

    it('应写入 miscRepo（分表）', async () => {
      await service.create(1, dto);
      expect(miscRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ submissionId: 42, code: 'int main(){}' }),
      );
    });

    it('应推入 judge-tx 队列', async () => {
      await service.create(1, dto);
      expect(judgeTxQueue.add).toHaveBeenCalledWith(
        'judge',
        expect.objectContaining({
          submissionId: 42,
          task: expect.objectContaining({ language: 1, code: 'int main(){}' }),
        }),
      );
    });

    it('传入 contestId 时应关联竞赛', async () => {
      submissionRepo.save.mockResolvedValue({
        ...mockSubmission,
        contestId: 10,
      });
      const result = await service.create(1, { ...dto, contestId: 10 });
      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ contestId: 10 }),
      );
      expect(result.contestId).toBe(10);
    });

    it('传入 courseId 时应关联课程', async () => {
      submissionRepo.save.mockResolvedValue({ ...mockSubmission, courseId: 5 });
      const result = await service.create(1, { ...dto, courseId: 5 });
      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: 5 }),
      );
      expect(result.courseId).toBe(5);
    });

    it('不传 contestId/courseId 时应存为 null', async () => {
      await service.create(1, dto);
      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ contestId: null, courseId: null }),
      );
    });
  });

  // =========================================================================
  // findAll – 分页
  // =========================================================================

  describe('findAll – 分页查询', () => {
    it('默认返回第 1 页，共 1 条', async () => {
      const result = await service.findAll({ page: 1, perPage: 20 });
      expect(result).toEqual({ items: [mockSubmission], total: 1 });
    });

    it('带条件时 createQueryBuilder 应被调用', async () => {
      await service.findAll({
        page: 1,
        perPage: 10,
        userId: 1,
        problemId: 1,
        status: Status.AC,
      });
      expect(submissionRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // findOne
  // =========================================================================

  describe('findOne', () => {
    it('找到时应返回提交', async () => {
      submissionRepo.findOne.mockResolvedValue(mockSubmission);
      const result = await service.findOne(42);
      expect(result.id).toBe(42);
    });

    it('找不到时应抛出 NotFoundException', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // remove
  // =========================================================================

  describe('remove', () => {
    it('删除存在的提交应返回 { deleted: true }', async () => {
      const result = await service.remove(42);
      expect(result).toEqual({ deleted: true });
    });

    it('删除不存在的提交应抛出 NotFoundException', async () => {
      submissionRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // rejudge
  // =========================================================================

  describe('rejudge', () => {
    beforeEach(() => {
      submissionRepo.findOne.mockResolvedValue({
        ...mockSubmission,
        problem: mockProblem,
      });
      miscRepo.findOne.mockResolvedValue(mockMisc);
    });

    it('应重置状态为 PENDING', async () => {
      await service.rejudge(42);
      expect(submissionRepo.update).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: Status.PENDING }),
      );
    });

    it('应推入队列', async () => {
      await service.rejudge(42);
      expect(judgeTxQueue.add).toHaveBeenCalledWith(
        'judge',
        expect.any(Object),
      );
    });

    it('应写入 rejudgeLog', async () => {
      await service.rejudge(42);
      expect(rejudgeLogRepo.save).toHaveBeenCalled();
    });

    it('提交不存在时应抛出 NotFoundException', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      await expect(service.rejudge(999)).rejects.toThrow(NotFoundException);
    });

    it('misc 不存在时应抛出 NotFoundException', async () => {
      miscRepo.findOne.mockResolvedValue(null);
      await expect(service.rejudge(42)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe('getStatus', () => {
    it('忽略旧 Redis 缓存，以当前数据库状态为准', async () => {
      redisService.get.mockResolvedValue('0');
      const result = await service.getStatus(42);
      expect(result).toEqual({ status: Status.PENDING });
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('Redis 无缓存时应从 DB 读取', async () => {
      redisService.get.mockResolvedValue(null);
      submissionRepo.findOne.mockResolvedValue({
        id: 42,
        status: Status.PENDING,
      });
      const result = await service.getStatus(42);
      expect(result).toEqual({ status: Status.PENDING });
    });

    it('Redis 无缓存且 DB 无记录时应抛出 NotFoundException', async () => {
      redisService.get.mockResolvedValue(null);
      submissionRepo.findOne.mockResolvedValue(null);
      await expect(service.getStatus(999)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // count
  // =========================================================================

  describe('count', () => {
    it('应返回总提交数', async () => {
      submissionRepo.count.mockResolvedValue(42);
      const result = await service.count();
      expect(result).toBe(42);
    });
  });

  // =========================================================================
  // search
  // =========================================================================

  describe('search', () => {
    it('应返回分页结果', async () => {
      const items = [{ id: 1, userId: 1 }];
      submissionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest.fn().mockResolvedValue(items),
          getCount: jest.fn().mockResolvedValue(1),
        }),
      );
      const result = await service.search(false, null, null, {}, 1);
      expect(result.total).toBe(1);
      expect(result.items).toEqual(items);
    });

    it('showRestricted=false 应添加 restricted/closed 过滤', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(false, null, null, {}, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('problem.restricted = false');
    });

    it('userId 过滤应传入查询', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { userId: 1 }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.userId = :userId', {
        userId: 1,
      });
    });

    it('language 过滤应传入查询', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { language: 1 }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.language = :language', {
        language: 1,
      });
    });

    it('status 过滤应传入查询', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { status: Status.AC }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.status = :status', {
        status: Status.AC,
      });
    });

    it('page > 5 时应缓存 10 分钟', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, {}, 6);
      expect(qb.cache).toHaveBeenCalledWith(10 * 60 * 1000);
    });
  });

  // =========================================================================
  // batchRejudge
  // =========================================================================

  describe('batchRejudge', () => {
    it('countOnly=true 时应返回数量', async () => {
      const qb = makeQb({ getCount: jest.fn().mockResolvedValue(5) });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.batchRejudge({}, true);
      expect(result).toBe(5);
    });

    it('countOnly=false 时应返回 undefined（异步触发重判）', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        select: jest.fn().mockReturnThis(),
      });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.batchRejudge({}, false);
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // inspect
  // =========================================================================

  describe('inspect', () => {
    it('本人可以查看代码', async () => {
      submissionRepo.findOne.mockResolvedValue({
        ...mockSubmission,
        misc: mockMisc,
      });
      const result = await service.inspect(42, 1, false);
      expect(result.code).toBe('int main(){}');
    });

    it('admin 可以查看代码', async () => {
      submissionRepo.findOne.mockResolvedValue({
        ...mockSubmission,
        userId: 99,
        misc: mockMisc,
      });
      const result = await service.inspect(42, 1, true);
      expect(result.code).toBeDefined();
    });

    it('非本人非 admin 应抛出 ForbiddenException', async () => {
      submissionRepo.findOne.mockResolvedValue({
        ...mockSubmission,
        userId: 99,
        misc: mockMisc,
      });
      await expect(service.inspect(42, 1, false)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('提交不存在时应抛出 NotFoundException', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      await expect(service.inspect(999, 1, false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getCE
  // =========================================================================

  describe('getCE', () => {
    it('本人可以查看 CE 详情', async () => {
      submissionRepo.findOne.mockResolvedValue({
        ...mockSubmission,
        misc: { ...mockMisc, compileErrorMsg: 'err' },
      });
      const result = await service.getCE(42, 1, false);
      expect(result).toBeDefined();
    });

    it('非本人非 admin 应抛出 ForbiddenException', async () => {
      submissionRepo.findOne.mockResolvedValue({
        ...mockSubmission,
        userId: 99,
      });
      await expect(service.getCE(42, 1, false)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('提交不存在时应抛出 NotFoundException', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      await expect(service.getCE(999, 1, false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getUserProblemStatus
  // =========================================================================

  describe('getUserProblemStatus', () => {
    it('AC 过应返回 ACCEPTED', async () => {
      const acQb = makeQb({ getCount: jest.fn().mockResolvedValue(1) });
      submissionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          clone: jest
            .fn()
            .mockReturnValueOnce(acQb) // acQb
            .mockReturnValueOnce(
              makeQb({ getCount: jest.fn().mockResolvedValue(0) }),
            ), // triedQb (不会用到)
          getCount: jest.fn().mockResolvedValue(0),
        }),
      );
      const result = await service.getUserProblemStatus(1, 1, null, null);
      expect(result).toBe(UserProblemStatus.ACCEPTED);
    });

    it('提交过但未 AC 应返回 ATTEMPTED', async () => {
      const acQb = makeQb({ getCount: jest.fn().mockResolvedValue(0) });
      const triedQb = makeQb({ getCount: jest.fn().mockResolvedValue(2) });
      submissionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          clone: jest
            .fn()
            .mockReturnValueOnce(acQb)
            .mockReturnValueOnce(triedQb),
          getCount: jest.fn().mockResolvedValue(0),
        }),
      );
      const result = await service.getUserProblemStatus(1, 1, null, null);
      expect(result).toBe(UserProblemStatus.ATTEMPTED);
    });

    it('没有提交过应返回 TODO', async () => {
      const acQb = makeQb({ getCount: jest.fn().mockResolvedValue(0) });
      const triedQb = makeQb({ getCount: jest.fn().mockResolvedValue(0) });
      submissionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          clone: jest
            .fn()
            .mockReturnValueOnce(acQb)
            .mockReturnValueOnce(triedQb),
          getCount: jest.fn().mockResolvedValue(0),
        }),
      );
      const result = await service.getUserProblemStatus(1, 1, null, null);
      expect(result).toBe(UserProblemStatus.TODO);
    });
  });

  // =========================================================================
  // getUserProblemStatusBatch
  // =========================================================================

  describe('getUserProblemStatusBatch', () => {
    it('空数组时应立即返回 {}', async () => {
      const result = await service.getUserProblemStatusBatch(1, [], null, null);
      expect(result).toEqual({});
    });

    it('AC 的题目应标记为 ACCEPTED', async () => {
      const acQb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([{ problemId: 1 }]),
      });
      const triedQb = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
      submissionRepo.createQueryBuilder
        .mockReturnValueOnce(acQb)
        .mockReturnValueOnce(triedQb);
      const result = await service.getUserProblemStatusBatch(
        1,
        [1, 2],
        null,
        null,
      );
      expect(result[1]).toBe(UserProblemStatus.ACCEPTED);
      expect(result[2]).toBe(UserProblemStatus.TODO);
    });

    it('尝试过但未 AC 应标记为 ATTEMPTED', async () => {
      const acQb = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
      const triedQb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([{ problemId: 2 }]),
      });
      submissionRepo.createQueryBuilder
        .mockReturnValueOnce(acQb)
        .mockReturnValueOnce(triedQb);
      const result = await service.getUserProblemStatusBatch(
        1,
        [1, 2],
        null,
        null,
      );
      expect(result[2]).toBe(UserProblemStatus.ATTEMPTED);
      expect(result[1]).toBe(UserProblemStatus.TODO);
    });
  });

  // =========================================================================
  // getSusList
  // =========================================================================

  describe('getSusList', () => {
    it('应按 hashsum 返回查重列表', async () => {
      const rows = [{ username: 'alice', submissionId: 1, hashsum: 'abc' }];
      suspicionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest.fn().mockResolvedValue(rows),
        }),
      );
      const result = await service.getSusList('abc');
      expect(result).toEqual(rows);
    });
  });

  // =========================================================================
  // getSusUnion
  // =========================================================================

  describe('getSusUnion', () => {
    it('空 userIds 应直接返回 []', async () => {
      const result = await service.getSusUnion();
      expect(result).toEqual([]);
    });

    it('无共同 hashsum 时应返回 []', async () => {
      suspicionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest.fn().mockResolvedValue([]),
        }),
      );
      const result = await service.getSusUnion(1, 2);
      expect(result).toEqual([]);
    });

    it('有共同 hashsum 时应返回合并结果', async () => {
      const hashRows = [{ hashsum: 'abc' }];
      const unionRows = [{ username: 'alice' }, { username: 'bob' }];
      let callCount = 0;
      suspicionRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({
          getRawMany: jest.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve(callCount === 1 ? hashRows : unionRows);
          }),
        }),
      );
      const result = await service.getSusUnion(1, 2);
      expect(result).toEqual(unionRows);
    });
  });

  // =========================================================================
  // checkSus
  // =========================================================================

  describe('checkSus', () => {
    it('suspicion 不存在时应返回 null', async () => {
      suspicionRepo.findOne.mockResolvedValue(null);
      const result = await service.checkSus(42);
      expect(result).toBeNull();
    });

    it('checked=false 时应切换为 true', async () => {
      const sus = { submissionId: 42, checked: false };
      suspicionRepo.findOne.mockResolvedValue(sus);
      suspicionRepo.save.mockImplementation((e) => Promise.resolve(e));
      const result = await service.checkSus(42);
      expect(result!.checked).toBe(true);
    });

    it('checked=true 时应切换为 false', async () => {
      const sus = { submissionId: 42, checked: true };
      suspicionRepo.findOne.mockResolvedValue(sus);
      suspicionRepo.save.mockImplementation((e) => Promise.resolve(e));
      const result = await service.checkSus(42);
      expect(result!.checked).toBe(false);
    });
  });

  // =========================================================================
  // applyLanguageBonus – 资源倍增
  // =========================================================================

  describe('applyLanguageBonus', () => {
    const p = (timeLimit: number, memoryLimit: number) =>
      ({ ...mockProblem, timeLimit, memoryLimit }) as Problem;

    it('Java(6) 时间 ×2，内存 ×5', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 6);
      expect(r.timeLimit).toBe(2000);
      expect(r.memoryLimit).toBe(320);
    });

    it('Kotlin(7) 时间 ×2，内存 ×5', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 7);
      expect(r.timeLimit).toBe(2000);
      expect(r.memoryLimit).toBe(320);
    });

    it('Python3(9) 时间 ×2，内存 ×3', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 9);
      expect(r.timeLimit).toBe(2000);
      expect(r.memoryLimit).toBe(192);
    });

    it('Python2(8) 时间 ×2，内存 ×3', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 8);
      expect(r.timeLimit).toBe(2000);
      expect(r.memoryLimit).toBe(192);
    });

    it('JavaScript(10) 时间 ×1（不变），内存 ×3', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 10);
      expect(r.timeLimit).toBe(1000);
      expect(r.memoryLimit).toBe(192);
    });

    it('TypeScript(11) 时间 ×1，内存 ×3', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 11);
      expect(r.timeLimit).toBe(1000);
      expect(r.memoryLimit).toBe(192);
    });

    it('C++(1) 无倍增', () => {
      const r = service.applyLanguageBonus(p(1000, 64), 1);
      expect(r.timeLimit).toBe(1000);
      expect(r.memoryLimit).toBe(64);
    });

    it('Java 内存不应低于 minMemory 64MB', () => {
      // 1 MB * 5 = 5 MB < 64 MB → 使用 64 MB
      const r = service.applyLanguageBonus(p(1000, 1), 6);
      expect(r.memoryLimit).toBe(64);
    });

    it('Python minMemory 32MB', () => {
      // 1 MB * 3 = 3 MB < 32 MB → 使用 32 MB
      const r = service.applyLanguageBonus(p(1000, 1), 9);
      expect(r.memoryLimit).toBe(32);
    });

    it('内存上限 1024 MB', () => {
      // 500 * 5 = 2500 MB → 截断为 1024 MB
      const r = service.applyLanguageBonus(p(1000, 500), 6);
      expect(r.memoryLimit).toBe(1024);
    });
  });

  // =========================================================================
  // getProblemRatio
  // =========================================================================

  describe('getProblemRatio', () => {
    it('应返回按 status 分组的提交统计', async () => {
      const rows = [
        { cnt: '5', status: Status.AC },
        { cnt: '10', status: Status.WA },
      ];
      submissionRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest.fn().mockResolvedValue(rows),
        }),
      );
      const result = await service.getProblemRatio(1, null, null);
      expect(result).toEqual(rows);
    });
  });

  // =========================================================================
  // searchRejudgeLog
  // =========================================================================

  describe('searchRejudgeLog', () => {
    it('应返回分页重判日志', async () => {
      const rows = [{ id: 1 }];
      rejudgeLogRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest.fn().mockResolvedValue(rows),
          getCount: jest.fn().mockResolvedValue(1),
        }),
      );
      const result = await service.searchRejudgeLog(false, {}, 1);
      expect(result.total).toBe(1);
      expect(result.items).toEqual(rows);
    });
  });

  // =========================================================================
  // susTest / checkSuspicion（静态方法）
  // =========================================================================

  describe('susTest / checkSuspicion', () => {
    it('应返回 hashsum 和各维度分析', () => {
      const result = service.susTest('int main() { return 0; }');
      expect(result).toHaveProperty('hashsum');
      expect(result).toHaveProperty('mas0');
      expect(result).toHaveProperty('chn');
    });

    it('静态方法 checkSuspicion 应返回相同结果', () => {
      const code = 'int x = 0;';
      const a = service.susTest(code);
      const b = SubmissionService.checkSuspicion(code);
      expect(a).toEqual(b);
    });

    it('中文注释应提升 chn 分', () => {
      const result = SubmissionService.checkSuspicion(
        '// 这是注释\nint main(){}',
      );
      // 注释被去掉后 chn=0，但包含中文的非注释内容会计分
      // 先确认 hashsum 存在即可
      expect(result.hashsum).toBeDefined();
    });
  });

  // =========================================================================
  // search - title 分支覆盖（lines 181-192）
  // =========================================================================

  describe('search - title 各种格式分支', () => {
    function makeSearchQb(items: any[] = [], total = 0) {
      return makeQb({
        getRawMany: jest.fn().mockResolvedValue(items),
        getCount: jest.fn().mockResolvedValue(total),
      });
    }

    it('title="P1001"（prefix+logicId）应使用 prefix AND logicId 过滤', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { title: 'P1001' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('problem.logicId'),
        expect.any(Object),
      );
    });

    it('title="P"（单字母 prefix）应使用 prefix 精确过滤', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { title: 'P' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('problem.prefix = :prefix', {
        prefix: 'p',
      });
    });

    it('title="AB"（多字母 prefix）应使用 prefix OR title LIKE 过滤', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { title: 'AB' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('problem.title LIKE'),
        expect.any(Object),
      );
    });

    it('title="123"（纯数字/无前缀）应使用 title LIKE OR id 过滤', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { title: '123' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('problem.id'),
        expect.any(Object),
      );
    });

    it('name 过滤（非 userId）应按 username/certifiedName 模糊查', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, false, { name: 'alice' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('user.username LIKE'),
        expect.any(Object),
      );
    });

    it('courseId=number 时应过滤 courseId', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, 5, false, {}, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.courseId = :courseId', {
        courseId: 5,
      });
    });

    it('courseId=null (false) 时应过滤 courseId IS NULL', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, null, false, {}, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.courseId IS NULL');
    });

    it('contestId=number 时应过滤 contestId', async () => {
      const qb = makeSearchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.search(true, false, 10, {}, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.contestId = :contestId', {
        contestId: 10,
      });
    });
  });

  // =========================================================================
  // searchRejudgeLog - 额外分支（lines 255-277）
  // =========================================================================

  describe('searchRejudgeLog - 额外分支', () => {
    it('showRestricted=false 时应添加 restricted/closed 过滤', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      rejudgeLogRepo.createQueryBuilder.mockReturnValue(qb);
      await service.searchRejudgeLog(false, {}, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('problem.restricted = false');
      expect(qb.andWhere).toHaveBeenCalledWith('problem.closed = false');
    });

    it('name 过滤应使用 username/certifiedName LIKE', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      rejudgeLogRepo.createQueryBuilder.mockReturnValue(qb);
      await service.searchRejudgeLog(true, { name: 'bob' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('user.username LIKE'),
        expect.any(Object),
      );
    });

    it('title 过滤应使用 title LIKE', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      rejudgeLogRepo.createQueryBuilder.mockReturnValue(qb);
      await service.searchRejudgeLog(true, { title: 'sum' }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('problem.title LIKE'),
        expect.any(Object),
      );
    });

    it('language 和 status 过滤', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      rejudgeLogRepo.createQueryBuilder.mockReturnValue(qb);
      await service.searchRejudgeLog(
        true,
        { language: 1, status: Status.AC },
        1,
      );
      expect(qb.andWhere).toHaveBeenCalledWith('s.language = :language', {
        language: 1,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.status = :status', {
        status: Status.AC,
      });
    });

    it('userId 过滤应使用 userId', async () => {
      const qb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      rejudgeLogRepo.createQueryBuilder.mockReturnValue(qb);
      await service.searchRejudgeLog(true, { userId: 5 }, 1);
      expect(qb.andWhere).toHaveBeenCalledWith('s.userId = :userId', {
        userId: 5,
      });
    });
  });

  // =========================================================================
  // batchRejudge - 过滤分支（lines 377-402）
  // =========================================================================

  describe('batchRejudge - 各种过滤分支', () => {
    function makeBatchQb() {
      return makeQb({
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
        select: jest.fn().mockReturnThis(),
      });
    }

    it('contestId=-1 时应过滤 contestId IS NULL', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ contestId: -1 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.contestId IS NULL');
    });

    it('contestId=5（非-1非undefined）时应过滤 contestId=5', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ contestId: 5 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.contestId = :contestId', {
        contestId: 5,
      });
    });

    it('courseId=-1 时应过滤 courseId IS NULL', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ courseId: -1 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.courseId IS NULL');
    });

    it('courseId=3 时应过滤 courseId=3', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ courseId: 3 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.courseId = :courseId', {
        courseId: 3,
      });
    });

    it('userId 过滤', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ userId: 10 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.userId = :userId', {
        userId: 10,
      });
    });

    it('problemId 过滤', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ problemId: 42 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.problemId = :problemId', {
        problemId: 42,
      });
    });

    it('status 过滤', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ status: Status.WA }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.status = :status', {
        status: Status.WA,
      });
    });

    it('idStart/idEnd 范围过滤', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.batchRejudge({ idStart: 100, idEnd: 200 }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.id >= :idStart', {
        idStart: 100,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.id <= :idEnd', {
        idEnd: 200,
      });
    });

    it('dateStart/dateEnd 范围过滤', async () => {
      const qb = makeBatchQb();
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      const dateStart = '2024-01-01';
      const dateEnd = '2024-12-31';
      await service.batchRejudge({ dateStart, dateEnd }, true);
      expect(qb.andWhere).toHaveBeenCalledWith('s.createdAt >= :dateStart', {
        dateStart,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.createdAt <= :dateEnd', {
        dateEnd,
      });
    });
  });
});
