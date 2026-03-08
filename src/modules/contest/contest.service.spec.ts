import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Contest } from '../../database/entities/contest.entity';
import { ContestProblem } from '../../database/entities/contest-problem.entity';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity';
import { User } from '../../database/entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { ContestService } from './contest.service';

// ─── Mock helpers ────────────────────────────────────────────────────────────

const makeQb = (overrides: Record<string, any> = {}) => {
  const qb: any = {
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return qb;
};

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findByIds: jest.fn(),
  findBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockRedisService = () => ({
  zrevrange: jest.fn(),
  zscore: jest.fn(),
  del: jest.fn(),
  zadd: jest.fn(),
});

// ─── Shared contest fixture ───────────────────────────────────────────────────

const contestFixture = {
  id: 1,
  name: 'Test Contest',
  startTime: new Date('2024-01-01'),
  endTime: new Date('2024-01-02'),
  description: '',
  notification: '',
  public: false,
  allowDirectLogin: true,
  openForRegistration: false,
  registrationEndTime: null,
  penalty: 20,
  deviceBindType: 0,
  scoreByPoint: false,
  fullyFreeze: false,
  freezeTime: 0,
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ContestService', () => {
  let service: ContestService;
  let contestRepo: ReturnType<typeof mockRepo>;
  let contestUserRepo: ReturnType<typeof mockRepo>;
  let contestUserProblemRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let contestProblemRepo: ReturnType<typeof mockRepo>;
  let redisService: ReturnType<typeof mockRedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContestService,
        { provide: getRepositoryToken(Contest), useFactory: mockRepo },
        { provide: getRepositoryToken(ContestProblem), useFactory: mockRepo },
        { provide: getRepositoryToken(ContestUser), useFactory: mockRepo },
        {
          provide: getRepositoryToken(ContestUserProblem),
          useFactory: mockRepo,
        },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: RedisService, useFactory: mockRedisService },
      ],
    }).compile();

    service = module.get<ContestService>(ContestService);
    contestRepo = module.get(getRepositoryToken(Contest));
    contestUserRepo = module.get(getRepositoryToken(ContestUser));
    contestUserProblemRepo = module.get(getRepositoryToken(ContestUserProblem));
    userRepo = module.get(getRepositoryToken(User));
    contestProblemRepo = module.get(getRepositoryToken(ContestProblem));
    redisService = module.get(RedisService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('返回竞赛列表（无过滤）', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[contestFixture], 1]),
      });
      contestRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.skip).toHaveBeenCalledWith(0);
    });

    it('支持分页参数', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      contestRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 2, perPage: 10 });

      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.skip).toHaveBeenCalledWith(10);
    });

    it('status=upcoming 添加 startTime 过滤', async () => {
      const qb = makeQb();
      contestRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: 'upcoming' as any });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.startTime > :now',
        expect.any(Object),
      );
    });

    it('status=ongoing 添加时间范围过滤', async () => {
      const qb = makeQb();
      contestRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: 'ongoing' as any });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.startTime <= :now AND c.endTime >= :now',
        expect.any(Object),
      );
    });

    it('status=ended 添加 endTime 过滤', async () => {
      const qb = makeQb();
      contestRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: 'ended' as any });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.endTime < :now',
        expect.any(Object),
      );
    });

    it('fromTime/toTime 过滤', async () => {
      const qb = makeQb();
      contestRepo.createQueryBuilder.mockReturnValue(qb);
      const fromTime = new Date('2024-01-01');
      const toTime = new Date('2024-12-31');

      await service.findAll({ fromTime, toTime } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('c.startTime >= :fromTime', {
        fromTime,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('c.startTime <= :toTime', {
        toTime,
      });
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('返回竞赛详情（含题目）', async () => {
      contestRepo.findOne.mockResolvedValue(contestFixture);
      const problems = [{ contestId: 1, problemId: 10, label: 'A' }];
      contestProblemRepo.find.mockResolvedValue(problems);

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.problems).toHaveLength(1);
      expect(contestProblemRepo.find).toHaveBeenCalledWith({
        where: { contestId: 1 },
        order: { label: 'ASC' },
      });
    });

    it('竞赛不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow('竞赛 999 不存在');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('创建竞赛（无题目）', async () => {
      const created = { ...contestFixture };
      contestRepo.create.mockReturnValue(created);
      contestRepo.save.mockResolvedValue(created);

      const dto = {
        name: 'Test Contest',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-01-02'),
      };
      const result = await service.create(dto as any);

      expect(contestRepo.create).toHaveBeenCalled();
      expect(contestRepo.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('创建竞赛（含题目）', async () => {
      const created = { id: 2, name: 'With Problems' };
      contestRepo.create.mockReturnValue(created);
      contestRepo.save.mockResolvedValue(created);
      contestProblemRepo.create.mockReturnValue({});
      contestProblemRepo.save.mockResolvedValue({});

      const dto = {
        name: 'With Problems',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-01-02'),
        problemIds: [101, 102, 103],
      };
      await service.create(dto as any);

      // 应该保存了3道题
      expect(contestProblemRepo.save).toHaveBeenCalledTimes(3);
    });

    it('创建竞赛（空题目列表不添加题目）', async () => {
      const created = { id: 3 };
      contestRepo.create.mockReturnValue(created);
      contestRepo.save.mockResolvedValue(created);

      await service.create({
        name: 'No Problems',
        startTime: new Date(),
        endTime: new Date(),
        problemIds: [],
      } as any);

      expect(contestProblemRepo.save).not.toHaveBeenCalled();
    });

    it('使用默认值创建竞赛', async () => {
      const created = { id: 4 };
      contestRepo.create.mockReturnValue(created);
      contestRepo.save.mockResolvedValue(created);

      await service.create({
        name: 'Defaults',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      expect(contestRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
          notification: '',
          allowDirectLogin: true,
          public: false,
          openForRegistration: false,
          penalty: 20,
          deviceBindType: 0,
          scoreByPoint: false,
          fullyFreeze: false,
          freezeTime: 0,
        }),
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('更新竞赛信息', async () => {
      contestRepo.findOne.mockResolvedValue({ ...contestFixture });
      contestRepo.save.mockResolvedValue({
        ...contestFixture,
        name: 'Updated',
      });

      const result = await service.update(1, { name: 'Updated' } as any);

      expect(contestRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('Updated');
    });

    it('竞赛不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('更新时替换题目列表', async () => {
      contestRepo.findOne.mockResolvedValue({ ...contestFixture });
      contestRepo.save.mockResolvedValue(contestFixture);
      contestProblemRepo.delete.mockResolvedValue({ affected: 2 });
      contestProblemRepo.create.mockReturnValue({});
      contestProblemRepo.save.mockResolvedValue({});

      await service.update(1, { problemIds: [201, 202] } as any);

      expect(contestProblemRepo.delete).toHaveBeenCalledWith({ contestId: 1 });
      expect(contestProblemRepo.save).toHaveBeenCalledTimes(2);
    });

    it('更新时传空题目列表清空所有题目', async () => {
      contestRepo.findOne.mockResolvedValue({ ...contestFixture });
      contestRepo.save.mockResolvedValue(contestFixture);
      contestProblemRepo.delete.mockResolvedValue({ affected: 2 });

      await service.update(1, { problemIds: [] } as any);

      expect(contestProblemRepo.delete).toHaveBeenCalledWith({ contestId: 1 });
      expect(contestProblemRepo.save).not.toHaveBeenCalled();
    });

    it('不传 problemIds 则不修改题目', async () => {
      contestRepo.findOne.mockResolvedValue({ ...contestFixture });
      contestRepo.save.mockResolvedValue(contestFixture);

      await service.update(1, { name: 'No Problem Update' } as any);

      expect(contestProblemRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('删除竞赛并清理 Redis', async () => {
      contestRepo.findOne.mockResolvedValue(contestFixture);
      contestRepo.remove.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(1);

      await service.remove(1);

      expect(contestRepo.remove).toHaveBeenCalledWith(contestFixture);
      expect(redisService.del).toHaveBeenCalledWith('contest-rank:1');
    });

    it('竞赛不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── registerUser ─────────────────────────────────────────────────────────

  describe('registerUser', () => {
    it('重复注册抛 ConflictException', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1, name: 'Test Contest' });
      userRepo.findOne.mockResolvedValue({ id: 1, username: 'testuser' });
      contestUserRepo.findOne.mockResolvedValue({ contestId: 1, userId: 1 });

      await expect(service.registerUser(1, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('正常注册成功', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1, name: 'Test Contest' });
      userRepo.findOne.mockResolvedValue({ id: 1, username: 'testuser' });
      contestUserRepo.findOne.mockResolvedValue(null);
      contestUserRepo.create.mockReturnValue({ contestId: 1, userId: 1 });
      contestUserRepo.save.mockResolvedValue({ contestId: 1, userId: 1 });

      const result = await service.registerUser(1, 1);
      expect(result).toBeDefined();
      expect(contestUserRepo.save).toHaveBeenCalled();
    });

    it('竞赛不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue(null);

      await expect(service.registerUser(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('用户不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1 });
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.registerUser(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── importContestUsers ───────────────────────────────────────────────────

  describe('importContestUsers', () => {
    it('竞赛不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue(null);

      await expect(service.importContestUsers(999, [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('新建用户（首次导入）', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1 });
      contestUserRepo.findOne.mockResolvedValue(null);
      contestUserRepo.create.mockReturnValue({ contestId: 1, userId: 10 });
      contestUserRepo.save.mockResolvedValue({ contestId: 1, userId: 10 });

      const result = await service.importContestUsers(1, [
        { userId: 10, password: 'abc123' } as any,
      ]);

      expect(result).toHaveLength(1);
      expect(contestUserRepo.save).toHaveBeenCalledTimes(1);
    });

    it('已存在用户则更新信息', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1 });
      const existing = {
        contestId: 1,
        userId: 10,
        seat: 'A1',
        room: 'R1',
        wildcard: false,
        female: false,
        passwordHash: 'oldhash',
      };
      contestUserRepo.findOne.mockResolvedValue(existing);
      contestUserRepo.save.mockResolvedValue({ ...existing, seat: 'B2' });

      const result = await service.importContestUsers(1, [
        { userId: 10, seat: 'B2', password: 'newpass' } as any,
      ]);

      expect(result).toHaveLength(1);
      expect(contestUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ seat: 'B2' }),
      );
    });

    it('自动生成密码（未提供 password）', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1 });
      contestUserRepo.findOne.mockResolvedValue(null);
      contestUserRepo.create.mockImplementation((data: any) => data);
      contestUserRepo.save.mockImplementation((data: any) =>
        Promise.resolve(data),
      );

      await service.importContestUsers(1, [{ userId: 10 } as any]);

      // passwordHash 应该存在（自动生成）
      expect(contestUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: expect.any(String) }),
      );
    });

    it('出错时跳过并继续处理其他用户', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1 });
      contestUserRepo.findOne
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(null);
      contestUserRepo.create.mockReturnValue({ contestId: 1, userId: 20 });
      contestUserRepo.save.mockResolvedValue({ contestId: 1, userId: 20 });

      const result = await service.importContestUsers(1, [
        { userId: 10 } as any,
        { userId: 20 } as any,
      ]);

      // 第一个出错被跳过，第二个成功
      expect(result).toHaveLength(1);
    });
  });

  // ─── getRanking ─────────────────────────────────────────────────────────────

  describe('getRanking', () => {
    it('从 Redis Sorted Set 读排行榜', async () => {
      redisService.zrevrange.mockResolvedValue(['1', '2', '3']);
      redisService.zscore
        .mockResolvedValueOnce('300')
        .mockResolvedValueOnce('200')
        .mockResolvedValueOnce('100');

      userRepo.findByIds.mockResolvedValue([
        { id: 1, username: 'user1', certifiedName: 'Alice' },
        { id: 2, username: 'user2', certifiedName: 'Bob' },
        { id: 3, username: 'user3', certifiedName: 'Charlie' },
      ]);

      contestUserRepo.find.mockResolvedValue([
        { userId: 1, accepts: 5, submits: 8 },
        { userId: 2, accepts: 4, submits: 6 },
        { userId: 3, accepts: 3, submits: 5 },
      ]);

      const result = await service.getRanking(1, 1, 50);

      expect(redisService.zrevrange).toHaveBeenCalledWith(
        'contest-rank:1',
        0,
        49,
      );
      expect(result).toHaveLength(3);
      expect(result[0].rank).toBe(1);
      expect(result[0].username).toBe('user1');
      expect(result[0].score).toBe(300);
      expect(contestRepo.findOne).not.toHaveBeenCalled();
    });

    it('Redis 为空时返回空数组', async () => {
      redisService.zrevrange.mockResolvedValue([]);

      const result = await service.getRanking(1, 1, 50);

      expect(result).toEqual([]);
      expect(userRepo.findByIds).not.toHaveBeenCalled();
    });

    it('用户不在 userMap 时使用 userId 作为 username', async () => {
      redisService.zrevrange.mockResolvedValue(['99']);
      redisService.zscore.mockResolvedValue('100');
      userRepo.findByIds.mockResolvedValue([]); // 没找到用户
      contestUserRepo.find.mockResolvedValue([]);

      const result = await service.getRanking(1, 1, 50);

      expect(result[0].username).toBe('99');
      expect(result[0].certifiedName).toBeNull();
    });

    it('分页参数正确传给 Redis', async () => {
      redisService.zrevrange.mockResolvedValue([]);

      await service.getRanking(1, 3, 10);

      // page=3, perPage=10 -> start=20, stop=29
      expect(redisService.zrevrange).toHaveBeenCalledWith(
        'contest-rank:1',
        20,
        29,
      );
    });
  });

  // ─── getBalloons ─────────────────────────────────────────────────────────────

  describe('getBalloons', () => {
    it('返回未送达气球列表', async () => {
      const balloons = [
        { id: 1, sent: false },
        { id: 2, sent: false },
      ];
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue(balloons) });
      contestUserProblemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getBalloons(1);

      expect(result).toHaveLength(2);
      expect(qb.where).toHaveBeenCalledWith(
        'cup.contestUserContestId = :contestId',
        { contestId: 1 },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('cup.sent = false');
    });

    it('无气球时返回空数组', async () => {
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      contestUserProblemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getBalloons(1);
      expect(result).toEqual([]);
    });
  });

  // ─── markBalloonDelivered ─────────────────────────────────────────────────

  describe('markBalloonDelivered', () => {
    it('标记气球已送', async () => {
      contestUserProblemRepo.update.mockResolvedValue({ affected: 1 });

      await expect(service.markBalloonDelivered(1)).resolves.not.toThrow();
      expect(contestUserProblemRepo.update).toHaveBeenCalledWith(
        { contestProblemId: 1, sent: false },
        { sent: true },
      );
    });

    it('气球不存在时抛 NotFoundException', async () => {
      contestUserProblemRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.markBalloonDelivered(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
