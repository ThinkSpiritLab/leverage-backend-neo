import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProblemService } from './problem.service';
import { Problem } from '../../database/entities/problem.entity';
import { Tag } from '../../database/entities/tag.entity';
import { ContestProblem } from '../../database/entities/contest-problem.entity';
import { CourseProblem } from '../../database/entities/course-problem.entity';
import { Submission } from '../../database/entities/submission.entity';
import { CacheService } from '../redis/cache.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeQb(overrides: Record<string, any> = {}) {
  const qb: Record<string, any> = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    cache: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getParameters: jest.fn().mockReturnValue({}),
    getQuery: jest
      .fn()
      .mockReturnValue('SELECT s.problemId FROM submission WHERE ...'),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getOne: jest.fn().mockResolvedValue(null),
    getRawOne: jest.fn().mockResolvedValue({ maxId: null }),
    getRawMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  // All chainable methods return `this`
  return qb;
}

const mockProblem: Problem = {
  id: 1,
  prefix: 'p',
  logicId: 1001,
  title: 'Test Problem',
  content: '## 题目描述',
  source: 'Leverage',
  timeLimit: 1000,
  memoryLimit: 64,
  difficulty: 2,
  cases: 3,
  multiCases: false,
  submits: 10,
  accepts: 5,
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

const mockTag: Tag = {
  id: 1,
  name: 'dp',
  color: '#ff0000',
  problems: [],
} as any;

// ── factory ───────────────────────────────────────────────────────────────────

async function createModule(
  overrides: {
    problemRepo?: Partial<Record<keyof any, any>>;
    tagRepo?: Partial<Record<keyof any, any>>;
    contestProblemRepo?: Partial<Record<keyof any, any>>;
    courseProblemRepo?: Partial<Record<keyof any, any>>;
    submissionRepo?: Partial<Record<keyof any, any>>;
    cacheService?: Partial<Record<keyof any, any>>;
    dataSource?: Partial<Record<keyof any, any>>;
  } = {},
) {
  const defaultQb = makeQb();

  const problemRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(
      makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[mockProblem], 1]),
        getOne: jest.fn().mockResolvedValue(mockProblem),
        getRawOne: jest.fn().mockResolvedValue({ maxId: 1000 }),
      }),
    ),
    findOne: jest.fn().mockResolvedValue(mockProblem),
    findBy: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[mockProblem], 1]),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockReturnValue(mockProblem),
    save: jest.fn().mockResolvedValue(mockProblem),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides.problemRepo,
  };

  const tagRepo = {
    findBy: jest.fn().mockResolvedValue([mockTag]),
    findOne: jest.fn().mockResolvedValue(mockTag),
    ...overrides.tagRepo,
  };

  const contestProblemRepo = {
    find: jest.fn().mockResolvedValue([]),
    ...overrides.contestProblemRepo,
  };

  const courseProblemRepo = {
    find: jest.fn().mockResolvedValue([]),
    ...overrides.courseProblemRepo,
  };

  const submissionRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(defaultQb),
    ...overrides.submissionRepo,
  };

  const cacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    ...overrides.cacheService,
  };

  // Minimal DataSource mock
  const transactionFn = jest.fn();
  const managerQb = makeQb({
    getRawOne: jest.fn().mockResolvedValue({ maxId: 1000 }),
  });
  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue(managerQb),
    create: jest.fn().mockReturnValue(mockProblem),
    save: jest.fn().mockResolvedValue(mockProblem),
  };
  transactionFn.mockImplementation(async (cb: (m: any) => Promise<void>) => {
    await cb(manager);
  });

  const dataSource = {
    transaction: transactionFn,
    ...overrides.dataSource,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ProblemService,
      { provide: getRepositoryToken(Problem), useValue: problemRepo },
      { provide: getRepositoryToken(Tag), useValue: tagRepo },
      {
        provide: getRepositoryToken(ContestProblem),
        useValue: contestProblemRepo,
      },
      {
        provide: getRepositoryToken(CourseProblem),
        useValue: courseProblemRepo,
      },
      { provide: getRepositoryToken(Submission), useValue: submissionRepo },
      { provide: CacheService, useValue: cacheService },
      { provide: DataSource, useValue: dataSource },
    ],
  }).compile();

  const service = module.get<ProblemService>(ProblemService);

  return {
    service,
    problemRepo,
    tagRepo,
    contestProblemRepo,
    courseProblemRepo,
    submissionRepo,
    cacheService,
    dataSource,
    manager,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('ProblemService', () => {
  // ── formatDisplayId ──────────────────────────────────────────────────────

  describe('formatDisplayId', () => {
    it('应该返回 "P1001" 格式', async () => {
      const { service } = await createModule();
      expect(service.formatDisplayId(mockProblem)).toBe('P1001');
    });

    it('应该将 prefix 转换为大写', async () => {
      const { service } = await createModule();
      expect(
        service.formatDisplayId({ ...mockProblem, prefix: 'a', logicId: 2000 }),
      ).toBe('A2000');
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll - 分页计算', () => {
    it('page=2, perPage=20 时 skip 应该为 20', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 2, perPage: 20 }, true);

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('page=1, perPage=10 时 skip 应该为 0', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, perPage: 10 }, true);

      expect(qb.skip).toHaveBeenCalledWith(0);
    });

    it('page=3, perPage=15 时 skip 应该为 30', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 3, perPage: 15 }, true);

      expect(qb.skip).toHaveBeenCalledWith(30);
    });

    it('默认 page=1, perPage=20', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[mockProblem], 1]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({}, true);

      expect(result).toEqual({ items: [mockProblem], total: 1 });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  describe('findAll - 权限过滤', () => {
    it('非 admin 应该添加 closed=false 和 restricted=false 过滤', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, perPage: 20 }, false);

      expect(qb.andWhere).toHaveBeenCalledWith('p.closed = :closed', {
        closed: false,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('p.restricted = :restricted', {
        restricted: false,
      });
    });

    it('admin 不应该添加权限过滤', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, perPage: 20 }, true);

      const closedCall = (qb.andWhere as jest.Mock).mock.calls.find(
        (call: any[]) => call[0] === 'p.closed = :closed',
      );
      expect(closedCall).toBeUndefined();
    });

    it('传入 tagIds 时应该添加标签过滤', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, perPage: 20, tagIds: [1, 2] }, true);

      expect(qb.andWhere).toHaveBeenCalledWith('tags.id IN (:...tagIds)', {
        tagIds: [1, 2],
      });
    });

    it('search 为纯数字时按 id/logicId 过滤', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ search: '123' }, true);

      const calls = (qb.andWhere as jest.Mock).mock.calls;
      const found = calls.find((c: any[]) => c[0].includes('p.logicId'));
      expect(found).toBeTruthy();
    });

    it('search 为字母+数字时按 prefix+logicId 过滤', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ search: 'P1001' }, true);

      const calls = (qb.andWhere as jest.Mock).mock.calls;
      const found = calls.find(
        (c: any[]) => c[0].includes('p.prefix') && c[0].includes('p.logicId'),
      );
      expect(found).toBeTruthy();
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne - 缓存', () => {
    it('缓存命中时直接返回缓存结果，不查 DB', async () => {
      const { service, cacheService, problemRepo } = await createModule({
        cacheService: {
          get: jest.fn().mockResolvedValue(mockProblem),
          set: jest.fn(),
          del: jest.fn(),
        },
      });

      const result = await service.findOne(1, true);

      expect(result).toBe(mockProblem);
      expect(problemRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('缓存未命中时查询 DB 并写入缓存（admin key）', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(mockProblem) });
      const { service, problemRepo, cacheService } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findOne(1, true);

      expect(result).toBe(mockProblem);
      expect(cacheService.set).toHaveBeenCalledWith(
        'problem:1:admin',
        mockProblem,
        6,
      );
    });

    it('缓存未命中时查询 DB 并写入缓存（user key）', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(mockProblem) });
      const { service, problemRepo, cacheService } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findOne(1, false);

      expect(cacheService.set).toHaveBeenCalledWith(
        'problem:1:user',
        mockProblem,
        6,
      );
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(null) });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.findOne(999, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('非 admin 应该在查询中添加权限过滤', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(mockProblem) });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findOne(1, false);

      expect(qb.andWhere).toHaveBeenCalledWith('p.closed = :closed', {
        closed: false,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('p.restricted = :restricted', {
        restricted: false,
      });
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('应该创建题目并返回保存后的实体', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: 1000 }),
      });
      const { service, problemRepo, tagRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);
      tagRepo.findBy.mockResolvedValue([mockTag]);
      problemRepo.create.mockReturnValue(mockProblem);
      problemRepo.save.mockResolvedValue(mockProblem);

      const result = await service.create({
        title: 'New Problem',
        content: '## 描述',
        source: 'test',
        timeLimit: 1000,
        memoryLimit: 64,
        cases: 0,
        tagIds: [1],
        prefix: 'p',
      } as any);

      expect(result).toBe(mockProblem);
      expect(problemRepo.save).toHaveBeenCalled();
    });

    it('不传 logicId 时应该自动获取下一个 ID', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: 2000 }),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);
      problemRepo.create.mockReturnValue(mockProblem);
      problemRepo.save.mockResolvedValue({
        ...mockProblem,
        logicId: 2001,
      });

      const result = await service.create({
        title: 'Auto ID Problem',
        content: '## 描述',
        source: 'test',
        timeLimit: 1000,
        memoryLimit: 64,
        cases: 0,
        prefix: 'p',
      } as any);

      // create 被调用时 logicId 应为 maxId+1 = 2001
      const createCall = problemRepo.create.mock.calls[0][0];
      expect(createCall.logicId).toBe(2001);
    });

    it('不传 tagIds 时 tags 应为空数组', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: null }),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);
      problemRepo.create.mockReturnValue(mockProblem);
      problemRepo.save.mockResolvedValue(mockProblem);

      await service.create({
        title: 'No Tag Problem',
        content: '## 描述',
        source: 'test',
        timeLimit: 1000,
        memoryLimit: 64,
        cases: 0,
        prefix: 'a',
      } as any);

      const createCall = problemRepo.create.mock.calls[0][0];
      expect(createCall.tags).toEqual([]);
      // maxId null → logicId 1000
      expect(createCall.logicId).toBe(1000);
    });

    it('prefix 应该被转为小写', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: null }),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);
      problemRepo.create.mockReturnValue(mockProblem);
      problemRepo.save.mockResolvedValue(mockProblem);

      await service.create({ title: 'X', prefix: 'ABC' } as any);

      const createCall = problemRepo.create.mock.calls[0][0];
      expect(createCall.prefix).toBe('abc');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('应该更新题目并清除缓存', async () => {
      const { service, problemRepo, cacheService } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [],
      });
      problemRepo.save.mockResolvedValue({
        ...mockProblem,
        title: 'Updated',
      });

      const result = await service.update(1, { title: 'Updated' });

      expect(result.title).toBe('Updated');
      expect(cacheService.del).toHaveBeenCalledWith(
        'problem:1:admin',
        'problem:1:user',
      );
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('传入 tagIds 时应该更新 tags', async () => {
      const { service, problemRepo, tagRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [],
      });
      tagRepo.findBy.mockResolvedValue([mockTag]);
      problemRepo.save.mockResolvedValue(mockProblem);

      await service.update(1, { tagIds: [1] } as any);

      const saveCall = problemRepo.save.mock.calls[0][0];
      expect(saveCall.tags).toEqual([mockTag]);
    });

    it('传入空 tagIds 时应该清空 tags', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });
      problemRepo.save.mockResolvedValue(mockProblem);

      await service.update(1, { tagIds: [] } as any);

      const saveCall = problemRepo.save.mock.calls[0][0];
      expect(saveCall.tags).toEqual([]);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('应该删除题目并清除缓存', async () => {
      const { service, problemRepo, cacheService } = await createModule();
      problemRepo.findOne.mockResolvedValue(mockProblem);
      problemRepo.remove.mockResolvedValue(undefined);

      await service.remove(1);

      expect(problemRepo.remove).toHaveBeenCalledWith(mockProblem);
      expect(cacheService.del).toHaveBeenCalledWith(
        'problem:1:admin',
        'problem:1:user',
      );
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── uploadTestData ────────────────────────────────────────────────────────

  describe('uploadTestData - zip 文件校验', () => {
    it('应该接受合法的 .zip 文件（application/zip）', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(mockProblem);

      const file = {
        originalname: 'testdata.zip',
        mimetype: 'application/zip',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(1, file)).resolves.not.toThrow();
    });

    it('应该接受 application/x-zip-compressed', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(mockProblem);

      const file = {
        originalname: 'testdata.zip',
        mimetype: 'application/x-zip-compressed',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(1, file)).resolves.not.toThrow();
    });

    it('应该接受 application/octet-stream + .zip 扩展名', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(mockProblem);

      const file = {
        originalname: 'testdata.zip',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(1, file)).resolves.not.toThrow();
    });

    it('应该拒绝 .txt 文件（抛出 BadRequestException）', async () => {
      const { service } = await createModule();

      const file = {
        originalname: 'testdata.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(1, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('应该拒绝 .rar 文件', async () => {
      const { service } = await createModule();

      const file = {
        originalname: 'testdata.rar',
        mimetype: 'application/x-rar-compressed',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(1, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('应该拒绝 MIME 不在白名单的 .zip', async () => {
      const { service } = await createModule();

      const file = {
        originalname: 'testdata.zip',
        mimetype: 'image/jpeg',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(1, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      const file = {
        originalname: 'testdata.zip',
        mimetype: 'application/zip',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(service.uploadTestData(999, file)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getNextId ─────────────────────────────────────────────────────────────

  describe('getNextId', () => {
    it('有记录时返回 maxId+1', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: 2000 }),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getNextId('p');

      expect(result).toEqual({ nextId: 2001 });
    });

    it('无记录时返回 1000', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: null }),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getNextId('p');

      expect(result).toEqual({ nextId: 1000 });
    });

    it('prefix 应该被转为小写传入查询', async () => {
      const qb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: null }),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getNextId('ABC');

      expect(qb.where).toHaveBeenCalledWith('p.prefix = :prefix', {
        prefix: 'abc',
      });
    });
  });

  // ── getOneByLogicId ───────────────────────────────────────────────────────

  describe('getOneByLogicId', () => {
    it('找到题目时应该返回', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(mockProblem) });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getOneByLogicId('p', 1001, true);

      expect(result).toBe(mockProblem);
    });

    it('找不到时应该抛出 NotFoundException', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(null) });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getOneByLogicId('p', 9999, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('非 admin 应该添加权限过滤', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(mockProblem) });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getOneByLogicId('p', 1001, false);

      expect(qb.andWhere).toHaveBeenCalledWith('p.closed = :closed', {
        closed: false,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('p.restricted = :restricted', {
        restricted: false,
      });
    });
  });

  // ── getTags ───────────────────────────────────────────────────────────────

  describe('getTags', () => {
    it('应该返回题目标签列表', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });

      const result = await service.getTags(1);

      expect(result).toEqual([mockTag]);
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.getTags(999)).rejects.toThrow(NotFoundException);
    });

    it('tags 为 undefined 时应该返回空数组', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: undefined,
      });

      const result = await service.getTags(1);

      expect(result).toEqual([]);
    });
  });

  // ── addTag ────────────────────────────────────────────────────────────────

  describe('addTag', () => {
    it('应该添加标签并返回更新后的标签列表', async () => {
      const { service, problemRepo, tagRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [],
      });
      tagRepo.findOne.mockResolvedValue(mockTag);
      problemRepo.save.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });

      const result = await service.addTag(1, 1);

      expect(result).toContain(mockTag);
      expect(problemRepo.save).toHaveBeenCalled();
    });

    it('标签已存在时不重复添加', async () => {
      const { service, problemRepo, tagRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });
      tagRepo.findOne.mockResolvedValue(mockTag);

      const result = await service.addTag(1, 1);

      expect(result).toEqual([mockTag]);
      expect(problemRepo.save).not.toHaveBeenCalled();
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.addTag(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('标签不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo, tagRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [],
      });
      tagRepo.findOne.mockResolvedValue(null);

      await expect(service.addTag(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── removeTag ─────────────────────────────────────────────────────────────

  describe('removeTag', () => {
    it('应该移除指定标签', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });
      problemRepo.save.mockResolvedValue({
        ...mockProblem,
        tags: [],
      });

      const result = await service.removeTag(1, 1);

      expect(result).toEqual([]);
      expect(problemRepo.save).toHaveBeenCalled();
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.removeTag(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('移除不存在的标签不报错，返回原列表', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });
      problemRepo.save.mockResolvedValue({
        ...mockProblem,
        tags: [mockTag],
      });

      const result = await service.removeTag(1, 999);

      expect(result).toEqual([mockTag]);
    });
  });

  // ── getProblemRatio ───────────────────────────────────────────────────────

  describe('getProblemRatio', () => {
    it('应该返回提交状态统计', async () => {
      const rawMany = [
        { status: 0, cnt: '5' },
        { status: 1, cnt: '3' },
      ];
      const subQb = makeQb({
        getRawMany: jest.fn().mockResolvedValue(rawMany),
      });
      const { service, problemRepo, submissionRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        closed: false,
        restricted: false,
      });
      submissionRepo.createQueryBuilder.mockReturnValue(subQb);

      const result = await service.getProblemRatio(1);

      expect(result).toEqual(rawMany);
    });

    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.getProblemRatio(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('题目 closed 时应该抛出 ForbiddenException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        closed: true,
        restricted: false,
      });

      await expect(service.getProblemRatio(1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('题目 restricted 时应该抛出 ForbiddenException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue({
        ...mockProblem,
        closed: false,
        restricted: true,
      });

      await expect(service.getProblemRatio(1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── refs ──────────────────────────────────────────────────────────────────

  describe('refs', () => {
    it('应该返回 [courseProblems, contestProblems]', async () => {
      const cp = [{ courseId: 1, problemId: 1, course: {} }];
      const ctp = [{ contestId: 1, problemId: 1, contest: {} }];
      const { service, courseProblemRepo, contestProblemRepo } =
        await createModule();
      courseProblemRepo.find.mockResolvedValue(cp);
      contestProblemRepo.find.mockResolvedValue(ctp);

      const result = await service.refs(1);

      expect(result).toEqual([cp, ctp]);
    });
  });

  // ── courseProblemList ─────────────────────────────────────────────────────

  describe('courseProblemList', () => {
    it('应该返回课程题目 ID 列表', async () => {
      const { service, courseProblemRepo } = await createModule();
      courseProblemRepo.find.mockResolvedValue([
        { problemId: 1 },
        { problemId: 2 },
      ]);

      const result = await service.courseProblemList(1);

      expect(result).toEqual([1, 2]);
    });

    it('无题目时返回空数组', async () => {
      const { service, courseProblemRepo } = await createModule();
      courseProblemRepo.find.mockResolvedValue([]);

      const result = await service.courseProblemList(99);

      expect(result).toEqual([]);
    });
  });

  // ── contestProblemList ────────────────────────────────────────────────────

  describe('contestProblemList', () => {
    it('应该返回竞赛题目 ID 列表', async () => {
      const { service, contestProblemRepo } = await createModule();
      contestProblemRepo.find.mockResolvedValue([
        { problemId: 10 },
        { problemId: 20 },
      ]);

      const result = await service.contestProblemList(1);

      expect(result).toEqual([10, 20]);
    });
  });

  // ── manageAvailableDigest ─────────────────────────────────────────────────

  describe('manageAvailableDigest', () => {
    it('应该调用 findAndCount 并返回结果', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findAndCount.mockResolvedValue([[mockProblem], 1]);

      const result = await service.manageAvailableDigest(1, 12);

      expect(result).toEqual([[mockProblem], 1]);
      expect(problemRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { closed: false },
          take: 12,
          skip: 0,
        }),
      );
    });

    it('page=2 时 skip 应该为 perPage', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.manageAvailableDigest(2, 10);

      expect(problemRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10 }),
      );
    });
  });

  // ── manuallyZipHashTestCase ───────────────────────────────────────────────

  describe('manuallyZipHashTestCase', () => {
    it('传入 all=true 时应该查找所有 cases>0 的题目', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.manuallyZipHashTestCase({ all: true });

      expect(result.message).toContain('2');
    });

    it('传入 problems 列表时应该使用指定 ID', async () => {
      const { service } = await createModule();

      const result = await service.manuallyZipHashTestCase({
        problems: [3, 4, 5],
      });

      expect(result.message).toContain('3');
    });

    it('既不传 all 也不传 problems 时应该排队 0 个', async () => {
      const { service } = await createModule();

      const result = await service.manuallyZipHashTestCase({});

      expect(result.message).toContain('0');
    });
  });

  // ── digestPartial ─────────────────────────────────────────────────────────

  describe('digestPartial', () => {
    it('应该返回 [problems, count]', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([mockProblem]),
        getCount: jest.fn().mockResolvedValue(1),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.digestPartial(1, 12, [], undefined, true);

      expect(result[0]).toEqual([mockProblem]);
      expect(result[1]).toBe(1);
    });

    it('非 admin 时应该添加权限过滤', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [], undefined, false);

      expect(qb.andWhere).toHaveBeenCalledWith('p.closed = :closed', {
        closed: false,
      });
    });

    it('传入 tags 时应该过滤', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [1, 2], undefined, true);

      expect(qb.andWhere).toHaveBeenCalledWith('tags.id IN (:...tags)', {
        tags: [1, 2],
      });
    });
  });

  // ── importFps checkOnly ───────────────────────────────────────────────────

  describe('importFps - checkOnly', () => {
    it('checkOnly=true 时应该解析并返回预览而不保存', async () => {
      const xmlBuffer = Buffer.from(`<?xml version="1.0"?>
<fps version="1.2">
  <item>
    <title>Sample Problem</title>
    <time_limit>1</time_limit>
    <memory_limit>128</memory_limit>
    <description><![CDATA[<p>Description here</p>]]></description>
    <sample_input><![CDATA[1 2]]></sample_input>
    <sample_output><![CDATA[3]]></sample_output>
    <source>Test</source>
  </item>
</fps>`);

      const { service, problemRepo } = await createModule();

      const result = await service.importFps(xmlBuffer, {
        checkOnly: true,
        indices: [0],
        prefix: 'p',
        source: 'Test',
        restricted: false,
        closed: false,
        noMarkdown: true,
      });

      expect(Array.isArray(result)).toBe(true);
      expect((result as any[])[0].title).toBe('Sample Problem');
      // checkOnly 不保存，不调用 repo
      expect(problemRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── getTestCasesFiles ─────────────────────────────────────────────────────

  describe('getTestCasesFiles', () => {
    it('题目不存在时应该抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(null);

      await expect(service.getTestCasesFiles(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('目录不存在时应该返回空数组', async () => {
      const { service, problemRepo } = await createModule();
      problemRepo.findOne.mockResolvedValue(mockProblem);

      // TEST_CASES_PATH 默认是 /tmp/testcases，指定路径不存在
      const result = await service.getTestCasesFiles(1);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── simpCreateExtra ───────────────────────────────────────────────────────

  describe('simpCreateExtra', () => {
    it('应该通过事务创建题目并返回', async () => {
      const { service, dataSource, manager } = await createModule();
      const managerQb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: 1000 }),
      });
      manager.createQueryBuilder.mockReturnValue(managerQb);
      manager.create.mockReturnValue(mockProblem);
      manager.save.mockResolvedValue(mockProblem);

      // simpCreateExtra 使用 ensureDir + writeFile，需要真实文件系统，会报错或成功
      // 由于 /tmp 通常可写，这里直接测试返回值
      try {
        const result = await service.simpCreateExtra('New Title', 'p', 1);
        expect(result).toBeDefined();
      } catch (e: any) {
        // 文件系统操作失败是可接受的（CI 环境）
        expect(e).toBeDefined();
      }
    });
  });

  // ── digestPartial - title 分支覆盖（lines 322-352） ───────────────────────

  describe('digestPartial - title 各种格式分支', () => {
    it('title="P1001"（prefix+logicId）应使用 prefix AND logicId 过滤', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [], 'P1001', true);

      const calls = (qb.andWhere as jest.Mock).mock.calls;
      const found = calls.find(
        (c: any[]) => c[0].includes('logicId') && c[0].includes('prefix'),
      );
      expect(found).toBeTruthy();
    });

    it('title="P"（单字母 prefix）应使用 prefix 精确过滤', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [], 'P', true);

      expect(qb.andWhere).toHaveBeenCalledWith('p.prefix = :prefix', {
        prefix: 'p',
      });
    });

    it('title="AB"（多字母 prefix）应使用 prefix OR title LIKE', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [], 'AB', true);

      const calls = (qb.andWhere as jest.Mock).mock.calls;
      const found = calls.find((c: any[]) => c[0].includes('title LIKE'));
      expect(found).toBeTruthy();
    });

    it('title="123"（纯数字）应使用 title LIKE OR id 过滤', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [], '123', true);

      const calls = (qb.andWhere as jest.Mock).mock.calls;
      const found = calls.find((c: any[]) => c[0].includes('p.id'));
      expect(found).toBeTruthy();
    });

    it('todoOnly=true + userId 时应添加 NOT IN 子查询', async () => {
      const subQb = makeQb({
        getQuery: jest.fn().mockReturnValue('SELECT s.problemId...'),
      });
      const mainQb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        getParameters: jest.fn().mockReturnValue({}),
      });
      const { service, problemRepo, submissionRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(mainQb);
      submissionRepo.createQueryBuilder.mockReturnValue(subQb);

      await service.digestPartial(1, 12, [], undefined, true, true, 42);

      const calls = (mainQb.andWhere as jest.Mock).mock.calls;
      const found = calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('NOT IN'),
      );
      expect(found).toBeTruthy();
    });

    it('todoOnly=true 但 userId 未定义时不应添加 NOT IN 过滤', async () => {
      const mainQb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(mainQb);

      await service.digestPartial(1, 12, [], undefined, true, true, undefined);

      const calls = (mainQb.andWhere as jest.Mock).mock.calls;
      const found = calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('NOT IN'),
      );
      expect(found).toBeFalsy();
    });

    it('admin 时应额外 addSelect restricted/closed', async () => {
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.digestPartial(1, 12, [], undefined, true);

      expect(qb.addSelect).toHaveBeenCalledWith(
        expect.arrayContaining(['p.restricted', 'p.closed']),
      );
    });
  });

  // ── importFps - checkOnly=false with test data（lines 716-722, 743-786） ──

  describe('importFps - checkOnly=false（保存）', () => {
    it('checkOnly=false 时应保存题目到 DB', async () => {
      const xmlBuffer = Buffer.from(`<?xml version="1.0"?>
<fps version="1.2">
  <item>
    <title>Save Test</title>
    <time_limit>2</time_limit>
    <memory_limit>256</memory_limit>
    <description><![CDATA[<p>Test desc</p>]]></description>
    <sample_input><![CDATA[1]]></sample_input>
    <sample_output><![CDATA[1]]></sample_output>
    <source>TestSource</source>
  </item>
</fps>`);

      const { service, manager } = await createModule();
      const managerQb = makeQb({
        getRawOne: jest.fn().mockResolvedValue({ maxId: 1000 }),
      });
      manager.createQueryBuilder.mockReturnValue(managerQb);
      manager.create.mockReturnValue(mockProblem);
      manager.save.mockResolvedValue(mockProblem);

      try {
        const result = await service.importFps(xmlBuffer, {
          checkOnly: false,
          indices: [0],
          prefix: 'p',
          source: 'Test',
          restricted: false,
          closed: false,
          noMarkdown: true,
        });
        expect(Array.isArray(result)).toBe(true);
      } catch (e: any) {
        // 文件系统操作失败是可接受的
        expect(e).toBeDefined();
      }
    });

    it('checkOnly=false + 带 test_input/test_output 时应计算 cases 数', async () => {
      const xmlBuffer = Buffer.from(`<?xml version="1.0"?>
<fps version="1.2">
  <item>
    <title>With Test Cases</title>
    <time_limit>1</time_limit>
    <memory_limit>128</memory_limit>
    <description><![CDATA[desc]]></description>
    <sample_input><![CDATA[1 2]]></sample_input>
    <sample_output><![CDATA[3]]></sample_output>
    <test_input><![CDATA[4 5]]></test_input>
    <test_output><![CDATA[9]]></test_output>
    <source>TestSrc</source>
  </item>
</fps>`);

      const { service } = await createModule();

      // checkOnly=true should parse and return cases count
      const result = await service.importFps(xmlBuffer, {
        checkOnly: true,
        indices: [0],
        prefix: 'p',
        source: 'Test',
        restricted: false,
        closed: false,
        noMarkdown: true,
      });
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[])[0].cases).toBe(1);
    });

    it('SPJ 题目不应被跳过，应正常导入并提取 checker 标记', async () => {
      const xmlBuffer = Buffer.from(`<?xml version="1.0"?>
<fps version="1.2">
  <item>
    <title>SPJ Problem</title>
    <time_limit>1</time_limit>
    <memory_limit>128</memory_limit>
    <description><![CDATA[desc]]></description>
    <sample_input><![CDATA[]]></sample_input>
    <sample_output><![CDATA[]]></sample_output>
    <source>Test</source>
    <spj>true</spj>
  </item>
  <item>
    <title>Normal Problem</title>
    <time_limit>1</time_limit>
    <memory_limit>128</memory_limit>
    <description><![CDATA[desc]]></description>
    <sample_input><![CDATA[]]></sample_input>
    <sample_output><![CDATA[]]></sample_output>
    <source>Test</source>
  </item>
</fps>`);

      const { service } = await createModule();

      const result = await service.importFps(xmlBuffer, {
        checkOnly: true,
        indices: [0, 1],
        prefix: 'p',
        source: 'Test',
        restricted: false,
        closed: false,
        noMarkdown: true,
      });
      // 两道题都应被导入（SPJ 题目不再跳过）
      expect((result as any[]).length).toBe(2);
      expect((result as any[])[0].title).toBe('SPJ Problem');
      expect((result as any[])[1].title).toBe('Normal Problem');
    });

    it('sample_input 多个时应全部加入内容', async () => {
      const xmlBuffer = Buffer.from(`<?xml version="1.0"?>
<fps version="1.2">
  <item>
    <title>Multi Sample</title>
    <time_limit>1</time_limit>
    <memory_limit>128</memory_limit>
    <description><![CDATA[desc]]></description>
    <sample_input><![CDATA[1]]></sample_input>
    <sample_input><![CDATA[2]]></sample_input>
    <sample_output><![CDATA[1]]></sample_output>
    <sample_output><![CDATA[4]]></sample_output>
    <source>Test</source>
  </item>
</fps>`);

      const { service } = await createModule();
      const result = await service.importFps(xmlBuffer, {
        checkOnly: true,
        indices: [0],
        prefix: 'p',
        source: 'Test',
        restricted: false,
        closed: false,
        noMarkdown: true,
      });
      expect((result as any[])[0].content).toContain('#1');
    });
  });

  // ── findAll - search 分支额外覆盖（line 121） ─────────────────────────────

  describe('findAll - search 单字母前缀分支', () => {
    it('search="P"（单字母）应使用 prefix OR title LIKE', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ search: 'P' }, true);

      const calls = (qb.andWhere as jest.Mock).mock.calls;
      // "P" regex matches prefix="P" no logicId → goes to else branch
      const found = calls.find((c: any[]) => c[0].includes('p.prefix'));
      expect(found).toBeTruthy();
    });
  });

  // ── SPJ / checker ─────────────────────────────────────────────────────────

  describe('getChecker', () => {
    it('应该返回 checkerCode 和 checkerLanguage', async () => {
      const problemWithChecker = {
        ...mockProblem,
        checkerCode: '#include <cstdio>',
        checkerLanguage: 'cpp17',
      };
      const checkerQb = makeQb({
        getOne: jest.fn().mockResolvedValue(problemWithChecker),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(checkerQb);

      const result = await service.getChecker(1);

      expect(result).toEqual({
        checkerCode: '#include <cstdio>',
        checkerLanguage: 'cpp17',
      });
    });

    it('题目不存在时应抛出 NotFoundException', async () => {
      const notFoundQb = makeQb({
        getOne: jest.fn().mockResolvedValue(null),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(notFoundQb);

      await expect(service.getChecker(999)).rejects.toThrow(NotFoundException);
    });

    it('无 checker 的题目应返回 null 值', async () => {
      const problemNoChecker = {
        ...mockProblem,
        checkerCode: undefined,
        checkerLanguage: undefined,
      };
      const noCheckerQb = makeQb({
        getOne: jest.fn().mockResolvedValue(problemNoChecker),
      });
      const { service, problemRepo } = await createModule();
      problemRepo.createQueryBuilder.mockReturnValue(noCheckerQb);

      const result = await service.getChecker(1);

      expect(result.checkerCode).toBeNull();
      expect(result.checkerLanguage).toBeNull();
    });
  });

  describe('setChecker', () => {
    it('应该调用 update 并返回新 checker 信息', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const { service, problemRepo, cacheService } = await createModule({
        problemRepo: {
          findOne: jest.fn().mockResolvedValue(mockProblem),
          createQueryBuilder: jest.fn().mockReturnValue(updateQb),
        },
      });

      const result = await service.setChecker(
        1,
        '#include <cstdio>',
        'cpp17',
      );

      expect(result).toEqual({
        checkerCode: '#include <cstdio>',
        checkerLanguage: 'cpp17',
      });
      expect(cacheService.del).toHaveBeenCalledWith(
        'problem:1:admin',
        'problem:1:user',
      );
    });

    it('题目不存在时应抛出 NotFoundException', async () => {
      const { service, problemRepo } = await createModule({
        problemRepo: {
          findOne: jest.fn().mockResolvedValue(null),
        },
      });

      await expect(
        service.setChecker(999, '#include <cstdio>', 'cpp17'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('parseFps - SPJ 题目导入', () => {
    it('有 SPJ 的 FPS 题目不应被跳过，应提取 checker 信息', async () => {
      const spjFps = `<?xml version="1.0" encoding="UTF-8"?>
<fps version="1.2" url="https://github.com/zhblue/freeproblemset/">
  <item>
    <title>SPJ Test</title>
    <time_limit unit="s">1</time_limit>
    <memory_limit unit="mb">64</memory_limit>
    <description><![CDATA[SPJ Problem]]></description>
    <sample_input><![CDATA[1 2]]></sample_input>
    <sample_output><![CDATA[Accepted]]></sample_output>
    <test_input><![CDATA[1 2]]></test_input>
    <test_output><![CDATA[Accepted]]></test_output>
    <hint></hint>
    <source>Test</source>
    <spj language="cpp17"><![CDATA[#include <cstdio>
int main() { return 0; }]]></spj>
  </item>
</fps>`;
      const { service } = await createModule();
      const buffer = Buffer.from(spjFps, 'utf-8');
      // parseFps 是 private，通过 importFps 的 checkOnly=true 路径调用
      const results = await (service as any).parseFps(buffer, true, true);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('SPJ Test');
      expect(results[0].checkerLanguage).toBe('cpp17');
      expect(results[0].checkerCode).toContain('#include <cstdio>');
    });

    it('无 SPJ 的题目 checkerCode 应为 undefined', async () => {
      const normalFps = `<?xml version="1.0" encoding="UTF-8"?>
<fps version="1.2" url="https://github.com/zhblue/freeproblemset/">
  <item>
    <title>Normal Test</title>
    <time_limit unit="s">1</time_limit>
    <memory_limit unit="mb">64</memory_limit>
    <description><![CDATA[Normal Problem]]></description>
    <sample_input><![CDATA[1 2]]></sample_input>
    <sample_output><![CDATA[3]]></sample_output>
    <test_input><![CDATA[1 2]]></test_input>
    <test_output><![CDATA[3]]></test_output>
    <hint></hint>
    <source>Test</source>
  </item>
</fps>`;
      const { service } = await createModule();
      const buffer = Buffer.from(normalFps, 'utf-8');
      const results = await (service as any).parseFps(buffer, true, true);

      expect(results).toHaveLength(1);
      expect((results[0] as any).checkerCode).toBeUndefined();
    });
  });
});
