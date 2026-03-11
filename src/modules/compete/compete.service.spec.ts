import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataSource } from 'typeorm';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';
import { MatchGamerLink } from '../../database/entities/match-gamer-link.entity';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { SettingService } from '../setting/setting.service';
import { HumanTurnService } from './human-turn.service';
import { CompeteService, MatchStatus } from './compete.service';

// ─── Mock helpers ────────────────────────────────────────────────────────────

/** 构造一个支持链式调用的 QueryBuilder mock */
const makeQb = (overrides: Record<string, any> = {}) => {
  const qb: any = {
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return qb;
};

/** 构造 Redis multi pipeline mock */
const makeMulti = (execResult: any[] = []) => {
  const pipeline: any = {
    set: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    setex: jest.fn().mockReturnThis(),
    pexpireat: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    hgetall: jest.fn().mockReturnThis(),
    hdel: jest.fn().mockReturnThis(),
    hexists: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(execResult),
  };
  return pipeline;
};

/** 构造 Redis client mock */
const makeRedisClient = (overrides: Record<string, any> = {}) => ({
  multi: jest.fn().mockReturnValue(makeMulti()),
  hexists: jest.fn().mockResolvedValue(0),
  hset: jest.fn().mockResolvedValue(1),
  hdel: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
  setex: jest.fn().mockResolvedValue('OK'),
  pexpireat: jest.fn().mockResolvedValue(1),
  ...overrides,
});

// ─── 公共夹具 ─────────────────────────────────────────────────────────────────

const gameFixture = {
  id: 1,
  title: 'TicTacToe',
  description: '井字棋',
  timeLimit: 1000,
  memoryLimit: 256,
  gamerQuantity: 2,
  disabled: false,
  allowHuman: false,
  judgerCode: 'judge code',
  judgerLanguage: 'python3',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  setName() { (this as any).name = this.title; },
} as Game;

const gamerFixture: Gamer = {
  id: 10,
  userId: 42,
  gameId: 1,
  title: 'MyBot',
  language: 'python3',
  opensource: true,
  code: 'print("hello")',
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const matchFixture: Match = {
  id: 100,
  gameId: 1,
  status: MatchStatus.FINISHED,
  result: '',
  score: [],
  links: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

// ─── 测试套件 ─────────────────────────────────────────────────────────────────

describe('CompeteService', () => {
  let service: CompeteService;

  // Repository mocks
  let mockGameRepo: any;
  let mockGamerRepo: any;
  let mockMatchRepo: any;
  let mockMatchGamerLinkRepo: any;

  // Dependency mocks
  let mockQueue: any;
  let mockDataSource: any;
  let mockRedisService: any;
  let mockSettingService: any;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockGameRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };

    mockGamerRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockMatchRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockMatchGamerLinkRepo = {
      find: jest.fn(),
      save: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    mockRedisClient = makeRedisClient();

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      hgetall: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    mockSettingService = {
      get: jest.fn(),
    };

    const qb = makeQb();
    mockDataSource = {
      query: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompeteService,
        { provide: getRepositoryToken(Game), useValue: mockGameRepo },
        { provide: getRepositoryToken(Gamer), useValue: mockGamerRepo },
        { provide: getRepositoryToken(Match), useValue: mockMatchRepo },
        {
          provide: getRepositoryToken(MatchGamerLink),
          useValue: mockMatchGamerLinkRepo,
        },
        { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: mockQueue },
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SettingService, useValue: mockSettingService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
        {
          provide: HumanTurnService,
          useValue: {
            waitForResponse: jest.fn(),
            waitForTurn: jest.fn(),
            submitResponse: jest.fn(),
            registerSSEClient: jest.fn(),
            unregisterSSEClient: jest.fn(),
            replayPendingTurn: jest.fn(),
            notifyGameOver: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CompeteService>(CompeteService);
  });

  // ─── Game CRUD ──────────────────────────────────────────────────────────────

  describe('findAllGames', () => {
    /** 构造 gameRepo.createQueryBuilder mock，用于 findAllGames（getRawAndEntities 结构） */
    const mockGameListQb = (entities: any[] = [], raw: any[] = []) => {
      const qb = makeQb({
        addSelect: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
      });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('应返回分页数据', async () => {
      mockGameRepo.count.mockResolvedValue(1);
      mockGameListQb([gameFixture], [{ g_activeBotCount: '2', g_recentMatchCount: '5' }]);
      const result = await service.findAllGames({ page: 1, perPage: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockGameRepo.count).toHaveBeenCalled();
    });

    it('默认 page=1, perPage=20', async () => {
      mockGameRepo.count.mockResolvedValue(0);
      mockGameListQb([], []);
      await service.findAllGames({});
      const qb = mockGameRepo.createQueryBuilder.mock.results[0].value;
      expect(qb.offset).toHaveBeenCalledWith(0);
      expect(qb.limit).toHaveBeenCalledWith(20);
    });

    it('perPage 最大不超过 100', async () => {
      mockGameRepo.count.mockResolvedValue(0);
      mockGameListQb([], []);
      await service.findAllGames({ page: 1, perPage: 999 });
      const qb = mockGameRepo.createQueryBuilder.mock.results[0].value;
      expect(qb.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('findOneGame', () => {
    it('找到游戏时返回游戏', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      const result = await service.findOneGame(1);
      expect(result).toEqual(gameFixture);
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue(null);
      await expect(service.findOneGame(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createGame', () => {
    it('应创建并返回游戏', async () => {
      const dto = {
        title: 'Chess',
        description: '国际象棋',
        timeLimit: 2000,
        memoryLimit: 512,
        gamerQuantity: 2,
        judgerCode: 'code',
        judgerLanguage: 'python3',
      };
      mockGameRepo.create.mockReturnValue({ ...dto, id: 2 });
      mockGameRepo.save.mockResolvedValue({ ...dto, id: 2 });

      const result = await service.createGame(dto as any);
      expect(mockGameRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ judgerCode: 'code', judgerLanguage: 'python3' }),
      );
      expect(mockGameRepo.save).toHaveBeenCalled();
      expect(result.id).toBe(2);
    });

    it('judgerCode 未传时默认为空字符串', async () => {
      const dto = {
        title: 'Chess',
        description: '国际象棋',
        timeLimit: 2000,
        memoryLimit: 512,
        gamerQuantity: 2,
        // judgerCode 和 judgerLanguage 均未传
      };
      mockGameRepo.create.mockReturnValue({ ...dto, id: 3, judgerCode: '', judgerLanguage: '' });
      mockGameRepo.save.mockResolvedValue({ ...dto, id: 3, judgerCode: '', judgerLanguage: '' });

      const result = await service.createGame(dto as any);
      // 应以空字符串填充 judgerCode/judgerLanguage
      expect(mockGameRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ judgerCode: '', judgerLanguage: '' }),
      );
      expect(result.id).toBe(3);
    });

    it('supervisor 角色可创建游戏', async () => {
      const dto = {
        title: 'MyGame',
        description: '测试',
        timeLimit: 1000,
        memoryLimit: 256,
        gamerQuantity: 2,
        judgerCode: 'judge',
        judgerLanguage: 'python3',
      };
      mockGameRepo.create.mockReturnValue({ ...dto, id: 4 });
      mockGameRepo.save.mockResolvedValue({ ...dto, id: 4 });

      // supervisor 角色调用 createGame（角色判断在 Controller 层由 RolesGuard 完成）
      const result = await service.createGame(dto as any, 'supervisor');
      expect(result.id).toBe(4);
    });
  });

  describe('findOneGameWithJudger', () => {
    it('应返回游戏的 judgerCode 和 judgerLanguage', async () => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({
          ...gameFixture,
          judgerCode: 'judge code',
          judgerLanguage: 'python3',
        }),
      });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findOneGameWithJudger(1);
      expect(result).toEqual({ judgerCode: 'judge code', judgerLanguage: 'python3' });
      expect(qb.addSelect).toHaveBeenCalledWith('g.judgerCode');
      expect(qb.addSelect).toHaveBeenCalledWith('g.judgerLanguage');
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(null) });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.findOneGameWithJudger(999)).rejects.toThrow(NotFoundException);
    });

    it('judgerCode 为空时返回空字符串', async () => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({
          ...gameFixture,
          judgerCode: undefined,
          judgerLanguage: undefined,
        }),
      });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findOneGameWithJudger(1);
      expect(result.judgerCode).toBe('');
      expect(result.judgerLanguage).toBe('');
    });
  });

  describe('updateGame', () => {
    it('应更新并返回游戏', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      mockGameRepo.update.mockResolvedValue({ affected: 1 });
      const updated = { ...gameFixture, title: 'NewTitle' };
      // 第二次 findOne（update 后）也返回更新值
      mockGameRepo.findOne
        .mockResolvedValueOnce(gameFixture)
        .mockResolvedValueOnce(updated);

      const result = await service.updateGame(1, { title: 'NewTitle' } as any);
      expect(mockGameRepo.update).toHaveBeenCalledWith(1, {
        title: 'NewTitle',
      });
      expect(result.title).toBe('NewTitle');
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue(null);
      await expect(service.updateGame(999, {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteGame', () => {
    it('应删除游戏', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      mockGameRepo.delete.mockResolvedValue({ affected: 1 });

      await service.deleteGame(1);
      expect(mockGameRepo.delete).toHaveBeenCalledWith(1);
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteGame(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLeaderboard', () => {
    it('应返回排行榜数据', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      const rawData = [
        { gamerId: 1, wins: '3', total: '5' },
        { gamerId: 2, wins: '2', total: '5' },
      ];
      const qb = makeQb({ getRawMany: jest.fn().mockResolvedValue(rawData) });
      mockDataSource.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLeaderboard(1);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        gamerId: 1,
        wins: 3,
        total: 5,
        winRate: 0.6,
      });
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue(null);
      await expect(service.getLeaderboard(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('total=0 时 winRate 为 0', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      const qb = makeQb({
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ gamerId: 1, wins: '0', total: '0' }]),
      });
      mockDataSource.createQueryBuilder.mockReturnValue(qb);
      const result = await service.getLeaderboard(1);
      expect(result[0].winRate).toBe(0);
    });
  });

  // ─── Gamer CRUD ─────────────────────────────────────────────────────────────

  describe('findAllGamers', () => {
    it('应返回 gamer 列表', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[gamerFixture], 1]),
      });
      mockGamerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAllGamers({ userId: 42 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('gameId 过滤器应传入 andWhere', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      mockGamerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAllGamers({ gameId: 5 });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'gamer.gameId = :gameId',
        expect.objectContaining({ gameId: 5 }),
      );
    });
  });

  describe('createGamer', () => {
    it('应创建并返回 gamer', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      mockGamerRepo.create.mockReturnValue(gamerFixture);
      mockGamerRepo.save.mockResolvedValue(gamerFixture);

      const dto = {
        gameId: 1,
        title: 'MyBot',
        language: 'python3',
        opensource: true,
        code: 'print("hi")',
      };
      const result = await service.createGamer(dto as any, 42);
      // Service 实际调用包含更多字段（type/webhookUrl 等），只验证核心字段
      expect(mockGamerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, gameId: 1, title: 'MyBot' }),
      );
      expect(result.id).toBe(10);
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createGamer({ gameId: 999 } as any, 42),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateGamer', () => {
    /** updateGamer 内部调用 findOneGamer，后者使用 createQueryBuilder */
    const mockGamerQb = (gamerOverride: Partial<typeof gamerFixture> = {}) => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({ ...gamerFixture, ...gamerOverride }),
      });
      mockGamerRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('应创建新版本 gamer 并返回', async () => {
      mockGamerQb(); // findOneGamer 返回 gamerFixture（userId=42）
      const forked = { ...gamerFixture, id: 99, title: 'Updated' };
      mockGamerRepo.create.mockReturnValue(forked);
      mockGamerRepo.save.mockResolvedValue(forked);

      const result = await service.updateGamer(
        10,
        { title: 'Updated' } as any,
        42,
      );
      expect(result.title).toBe('Updated');
    });

    it('非本人修改时抛 BadRequestException', async () => {
      mockGamerQb({ userId: 99 }); // 返回不同 userId
      await expect(service.updateGamer(10, {} as any, 42)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Match ───────────────────────────────────────────────────────────────────

  describe('findAllMatches', () => {
    it('应返回对局列表', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[matchFixture], 1]),
      });
      mockMatchRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAllMatches({ gameId: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findOneMatch', () => {
    it('找到对局时返回', async () => {
      mockMatchRepo.findOne.mockResolvedValue(matchFixture);
      const result = await service.findOneMatch(100);
      expect(result.id).toBe(100);
    });

    it('不存在时抛 NotFoundException', async () => {
      mockMatchRepo.findOne.mockResolvedValue(null);
      await expect(service.findOneMatch(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('inspectMatch', () => {
    it('应返回对局详情及参赛 gamer', async () => {
      mockMatchRepo.findOne.mockResolvedValue(matchFixture);
      mockMatchGamerLinkRepo.find.mockResolvedValue([
        { matchId: 100, gamerId: 10, index: 0 },
        { matchId: 100, gamerId: 11, index: 1 },
      ]);
      const qb = makeQb({
        getMany: jest.fn().mockResolvedValue([
          { id: 10, title: 'BotA', language: 'python3', code: 'a', userId: 42 },
          { id: 11, title: 'BotB', language: 'cpp', code: 'b', userId: 43 },
        ]),
      });
      mockGamerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.inspectMatch(100, 42);
      expect(result.match).toEqual(matchFixture);
      expect(result.participants).toHaveLength(2);
      expect(result.participants[0].gamerId).toBe(10);
    });

    it('对局不存在时抛 NotFoundException', async () => {
      mockMatchRepo.findOne.mockResolvedValue(null);
      await expect(service.inspectMatch(999, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('没有参赛者时应正常处理', async () => {
      mockMatchRepo.findOne.mockResolvedValue(matchFixture);
      mockMatchGamerLinkRepo.find.mockResolvedValue([]);
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      mockGamerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.inspectMatch(100, 42);
      expect(result.participants).toHaveLength(0);
    });
  });

  describe('launchMatch', () => {
    /** 构造 gameRepo.createQueryBuilder 的 mock，返回包含 judgerCode 的 game */
    const mockGameQb = (gameOverride: Partial<typeof gameFixture> = {}) => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({ ...gameFixture, ...gameOverride }),
      });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('应发起对局并推入队列', async () => {
      mockGameQb();
      const gamer1 = { id: 10, code: 'a', language: 'python3', type: 'code' };
      const gamer2 = { id: 11, code: 'b', language: 'cpp', type: 'code' };
      mockGamerRepo.find.mockResolvedValue([gamer1, gamer2]);
      mockMatchRepo.save.mockResolvedValue({
        id: 100,
        gameId: 1,
        status: MatchStatus.PENDING,
      });
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.launchMatch(1, [10, 11]);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'compete',
        expect.objectContaining({ matchId: 100 }),
      );
      expect(result.id).toBe(100);
    });

    it('参赛人数不匹配时抛 BadRequestException', async () => {
      mockGameQb({ gamerQuantity: 2 });
      await expect(service.launchMatch(1, [10])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('部分 gamer 不存在时抛 NotFoundException', async () => {
      mockGameQb();
      mockGamerRepo.find.mockResolvedValue([gamerFixture]); // 只返回 1 个，但传入 2 个 ID
      await expect(service.launchMatch(1, [10, 11])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('launchMatch 携带 judgerCode 推入队列', async () => {
      mockGameQb({ judgerCode: 'custom_judge', judgerLanguage: 'cpp17' });
      const gamer1 = { id: 10, code: 'a', language: 'python3', type: 'code' };
      const gamer2 = { id: 11, code: 'b', language: 'cpp', type: 'code' };
      mockGamerRepo.find.mockResolvedValue([gamer1, gamer2]);
      mockMatchRepo.save.mockResolvedValue({ id: 101, gameId: 1, status: MatchStatus.PENDING });
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      await service.launchMatch(1, [10, 11]);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'compete',
        expect.objectContaining({
          game: expect.objectContaining({
            judgerCode: 'custom_judge',
            judgerLanguage: 'cpp17',
          }),
        }),
      );
    });
  });

  // ─── triggerAutoMatch ────────────────────────────────────────────────────────

  describe('triggerAutoMatch', () => {
    /** 帮助函数：构造 N 个 mock gamer */
    const makeGamers = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        gameId: 1,
        type: 'code',
        disabled: false,
        elo: 1000 - i * 10,
        code: `code_${i}`,
        language: 'python3',
      }));

    /** 构造 gameRepo.findOne mock（用于 findOneGame） */
    const mockFindOneGame = (gamerQuantity: number, disabled = false) => {
      mockGameRepo.findOne.mockResolvedValue({ ...gameFixture, gamerQuantity, disabled });
    };

    /** 构造 launchMatch 内部所需的 createQueryBuilder mock */
    const mockLaunchMatchDeps = (gamerQuantity: number, gamers: any[]) => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({ ...gameFixture, gamerQuantity }),
      });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);
      mockGamerRepo.find
        .mockResolvedValueOnce(gamers) // triggerAutoMatch 内部的 gamerRepo.find
        .mockResolvedValue(gamers);    // launchMatch 内部每次调用
      mockMatchRepo.save.mockImplementation(() =>
        Promise.resolve({ id: Math.floor(Math.random() * 10000), gameId: 1, status: MatchStatus.PENDING }),
      );
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);
    };

    it('2人游戏：4个参赛者生成 C(4,2)=6 场对局', async () => {
      const allGamers = makeGamers(4);
      mockFindOneGame(2);
      mockGameRepo.createQueryBuilder.mockReturnValue(
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, gamerQuantity: 2 }) }),
      );
      // 动态 mock：triggerAutoMatch 首次 find 用 take，launchMatch 按 ID 过滤
      mockGamerRepo.find.mockImplementation(async (opts: any) => {
        if (opts?.take !== undefined) return allGamers.slice(0, opts.take ?? allGamers.length);
        const inOp = opts?.where?.id;
        const ids: number[] = inOp?._value ?? inOp?.value ?? [];
        return allGamers.filter((g) => ids.includes(g.id));
      });
      mockMatchRepo.save.mockImplementation(() =>
        Promise.resolve({ id: Math.floor(Math.random() * 10000), gameId: 1, status: MatchStatus.PENDING }),
      );
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.triggerAutoMatch(1, 4);
      expect(result.created).toBe(6);
    });

    it('3人游戏：4个参赛者生成 C(4,3)=4 场对局', async () => {
      const allGamers = makeGamers(4);
      mockFindOneGame(3);
      mockGameRepo.createQueryBuilder.mockReturnValue(
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, gamerQuantity: 3 }) }),
      );
      mockGamerRepo.find.mockImplementation(async (opts: any) => {
        if (opts?.take !== undefined) return allGamers.slice(0, opts.take ?? allGamers.length);
        const inOp = opts?.where?.id;
        const ids: number[] = inOp?._value ?? inOp?.value ?? [];
        return allGamers.filter((g) => ids.includes(g.id));
      });
      mockMatchRepo.save.mockImplementation(() =>
        Promise.resolve({ id: Math.floor(Math.random() * 10000), gameId: 1, status: MatchStatus.PENDING }),
      );
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.triggerAutoMatch(1, 4);
      expect(result.created).toBe(4);
    });

    it('3人游戏：3个参赛者生成 C(3,3)=1 场对局', async () => {
      const gamers = makeGamers(3);
      mockFindOneGame(3);

      mockGameRepo.createQueryBuilder.mockReturnValue(
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, gamerQuantity: 3 }) }),
      );
      mockGamerRepo.find
        .mockResolvedValueOnce(gamers)
        .mockResolvedValue(gamers);
      mockMatchRepo.save.mockResolvedValue({ id: 200, gameId: 1, status: MatchStatus.PENDING });
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.triggerAutoMatch(1, 3);
      expect(result.created).toBe(1);
      expect(result.matchIds).toContain(200);
    });

    it('参赛者不足时抛 BadRequestException', async () => {
      const gamers = makeGamers(2);
      mockFindOneGame(3);
      mockGamerRepo.find.mockResolvedValueOnce(gamers);

      await expect(service.triggerAutoMatch(1, 8)).rejects.toThrow(BadRequestException);
    });

    it('游戏被禁用时抛 BadRequestException', async () => {
      mockFindOneGame(2, true);
      await expect(service.triggerAutoMatch(1)).rejects.toThrow(BadRequestException);
    });

    it('超过 20 场上限时截断', async () => {
      // C(7,2) = 21 > 20，应截断为 20
      const allGamers = makeGamers(7);
      mockFindOneGame(2);
      mockGameRepo.createQueryBuilder.mockReturnValue(
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, gamerQuantity: 2 }) }),
      );
      mockGamerRepo.find.mockImplementation(async (opts: any) => {
        if (opts?.take !== undefined) return allGamers.slice(0, opts.take ?? allGamers.length);
        const inOp = opts?.where?.id;
        const ids: number[] = inOp?._value ?? inOp?.value ?? [];
        return allGamers.filter((g) => ids.includes(g.id));
      });
      mockMatchRepo.save.mockImplementation(() =>
        Promise.resolve({ id: Math.floor(Math.random() * 10000), gameId: 1, status: MatchStatus.PENDING }),
      );
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.triggerAutoMatch(1, 7);
      expect(result.created).toBe(20);
    });
  });

  // ─── updateElo (3人) ─────────────────────────────────────────────────────────

  describe('updateElo (3人游戏)', () => {
    it('3人对局 pairwise ELO 计算无误', async () => {
      // 通过 handleMatchResult 的内部路径间接测 updateElo：
      // 直接测 private 方法，用 (service as any).updateElo
      const gamer1 = { id: 1, elo: 1000, eloExternal: 1000 };
      const gamer2 = { id: 2, elo: 1000, eloExternal: 1000 };
      const gamer3 = { id: 3, elo: 900,  eloExternal: 900  };
      mockGamerRepo.findBy = jest.fn().mockResolvedValue([gamer1, gamer2, gamer3]);
      mockGamerRepo.update = jest.fn().mockResolvedValue({});
      mockDataSource.query = jest.fn().mockResolvedValue([]);

      // gamer1 胜（score 最高），gamer2 次之，gamer3 败
      const finalResult: Record<string, number> = { '1': 10, '2': 5, '3': 1 };
      await (service as any).updateElo(finalResult, 'inner', 42);

      // gamer1 赢了两场 pairwise，elo 应上升
      const updateCalls: [number, any][] = mockGamerRepo.update.mock.calls;
      const g1Update = updateCalls.find(([id]) => id === 1)?.[1];
      const g3Update = updateCalls.find(([id]) => id === 3)?.[1];
      expect(g1Update?.elo).toBeGreaterThan(1000);
      expect(g3Update?.elo).toBeLessThan(900);
    });
  });

  // ─── launchMatch (3人) ───────────────────────────────────────────────────────

  describe('launchMatch (3人游戏)', () => {
    it('3人游戏创建正确的 match_gamer_link 记录', async () => {
      const game3 = { ...gameFixture, gamerQuantity: 3 };
      const qb = makeQb({ getOne: jest.fn().mockResolvedValue(game3) });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);

      const g1 = { id: 1, code: 'a', language: 'python3', type: 'code' };
      const g2 = { id: 2, code: 'b', language: 'cpp',     type: 'code' };
      const g3 = { id: 3, code: 'c', language: 'java',    type: 'code' };
      mockGamerRepo.find.mockResolvedValue([g1, g2, g3]);
      mockMatchRepo.save.mockResolvedValue({ id: 300, gameId: 1, status: MatchStatus.PENDING });
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.launchMatch(1, [1, 2, 3]);
      expect(result.id).toBe(300);

      // 确认 matchGamerLinkRepo.save 被调用，且包含 3 个 link
      const savedLinks = mockMatchGamerLinkRepo.save.mock.calls[0][0];
      expect(savedLinks).toHaveLength(3);
      expect(savedLinks[0]).toMatchObject({ matchId: 300, gamerId: 1, index: 0 });
      expect(savedLinks[1]).toMatchObject({ matchId: 300, gamerId: 2, index: 1 });
      expect(savedLinks[2]).toMatchObject({ matchId: 300, gamerId: 3, index: 2 });
    });
  });

// ─── Room ────────────────────────────────────────────────────────────────────

  describe('createRoom', () => {
    it('应创建房间并返回 roomId', async () => {
      mockGameRepo.findOne.mockResolvedValue(gameFixture);
      mockDataSource.query.mockResolvedValue([{ id: 42, username: 'alice' }]);
      const multiMock = makeMulti([
        [null, 'OK'],
        [null, 1],
      ]);
      mockRedisClient.multi.mockReturnValue(multiMock);

      const result = await service.createRoom({ gameId: 1 }, 42, true);
      expect(result.roomId).toBeGreaterThanOrEqual(10000000);
      expect(result.roomId).toBeLessThanOrEqual(99999999);
      expect(multiMock.set).toHaveBeenCalled();
      expect(multiMock.expire).toHaveBeenCalled();
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createRoom({ gameId: 999 }, 42, false),
      ).rejects.toThrow(NotFoundException);
    });

    it('游戏被禁用且非管理员时抛 NotFoundException', async () => {
      mockGameRepo.findOne.mockResolvedValue({
        ...gameFixture,
        disabled: true,
      });
      await expect(
        service.createRoom({ gameId: 1 }, 42, false),
      ).rejects.toThrow(NotFoundException);
    });

    it('管理员可以创建已禁用游戏的房间', async () => {
      mockGameRepo.findOne.mockResolvedValue({
        ...gameFixture,
        disabled: true,
      });
      mockDataSource.query.mockResolvedValue([{ id: 42, username: 'admin' }]);
      const multiMock = makeMulti();
      mockRedisClient.multi.mockReturnValue(multiMock);

      const result = await service.createRoom({ gameId: 1 }, 42, true);
      expect(result.roomId).toBeDefined();
    });
  });

  describe('listOpenRooms', () => {
    it('应返回开放房间列表', async () => {
      const rooms = { '12345678': '{"id":12345678}' };
      mockRedisService.hgetall.mockResolvedValue(rooms);

      const result = await service.listOpenRooms();
      expect(result).toEqual(rooms);
    });
  });

  describe('getRoomCooldown', () => {
    it('应返回冷却时间信息', async () => {
      mockRedisService.get.mockResolvedValue('2');
      mockSettingService.get.mockResolvedValue('3');
      mockRedisService.ttl.mockResolvedValue(3600);

      const result = await service.getRoomCooldown(42);
      expect(result.nGameCreated).toBe(2);
      expect(result.maxGame).toBe(3);
      expect(result.time_remaining).toBe(3600);
    });

    it('未创建过房间时 nGameCreated 为 0', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSettingService.get.mockResolvedValue('3');
      mockRedisService.ttl.mockResolvedValue(0);

      const result = await service.getRoomCooldown(42);
      expect(result.nGameCreated).toBe(0);
    });
  });

  describe('getRoomOverview', () => {
    const roomInfo = {
      id: 12345678,
      owner: { id: 42, username: 'alice' },
      game: {
        id: 1,
        title: 'TicTacToe',
        timeLimit: 1000,
        memoryLimit: 256,
        gamerQuantity: 2,
        disabled: false,
      },
      createAt: Date.now(),
    };

    it('应返回房间详情', async () => {
      // multi() exec 结果: [infoRes, submittersRes, playersRes, openRes, startRes]
      const execResult = [
        [null, JSON.stringify(roomInfo)], // info
        [null, null], // submitters (empty)
        [null, null], // players (empty)
        [null, 1], // open flag
        [null, null], // start key (not started)
      ];
      mockRedisClient.multi.mockReturnValue(makeMulti(execResult));

      const result = await service.getRoomOverview(12345678);
      expect(result.info).toMatchObject({ id: 12345678 });
    });

    it('房间已开始时返回 matchId', async () => {
      const execResult = [
        [null, JSON.stringify(roomInfo)],
        [null, null],
        [null, null],
        [null, 0],
        [null, '100'], // room started with matchId=100
      ];
      mockRedisClient.multi.mockReturnValue(makeMulti(execResult));

      const result = await service.getRoomOverview(12345678);
      expect(result.matchId).toBe(100);
    });

    it('房间不存在时抛 InternalServerErrorException', async () => {
      const execResult = [
        [null, null], // info is null
        [null, null],
        [null, null],
        [null, 0],
        [null, null],
      ];
      // 让 destroyRoom 的 multi 也 mock 好
      mockRedisClient.multi.mockReturnValue(makeMulti(execResult));

      await expect(service.getRoomOverview(99999999)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('submitGamer', () => {
    const roomInfo = {
      id: 12345678,
      owner: { id: 42, username: 'alice' },
      game: {
        id: 1,
        title: 'TicTacToe',
        timeLimit: 1000,
        memoryLimit: 256,
        gamerQuantity: 2,
        disabled: false,
      },
      createAt: Date.now(),
    };

    it('应提交 gamer 到房间', async () => {
      // 房间开放中
      mockRedisClient.hexists.mockResolvedValue(1);
      mockGamerRepo.findOne.mockResolvedValue(gamerFixture);
      mockDataSource.query.mockResolvedValue([{ id: 42, username: 'alice' }]);
      const multiMock = makeMulti([
        [null, 1],
        [null, 1],
      ]);
      mockRedisClient.multi.mockReturnValue(multiMock);

      await expect(
        service.submitGamer(12345678, { gamerId: 10 } as any, 42),
      ).resolves.toBeUndefined();
      expect(multiMock.hset).toHaveBeenCalled();
    });

    it('非 gamer 拥有者提交时抛 ForbiddenException', async () => {
      mockRedisClient.hexists.mockResolvedValue(1);
      mockGamerRepo.findOne.mockResolvedValue({ ...gamerFixture, userId: 99 });
      await expect(
        service.submitGamer(12345678, { gamerId: 10 } as any, 42),
      ).rejects.toThrow(ForbiddenException);
    });

    it('gamer 不存在时抛 NotFoundException', async () => {
      mockRedisClient.hexists.mockResolvedValue(1);
      mockGamerRepo.findOne.mockResolvedValue(null);
      await expect(
        service.submitGamer(12345678, { gamerId: 999 } as any, 42),
      ).rejects.toThrow(NotFoundException);
    });

    it('房间关闭时需要验证房主身份', async () => {
      mockRedisClient.hexists.mockResolvedValue(0); // not open
      // getRoomInfo 失败（getRoomInfo 调用 redisService.get）
      mockRedisService.get.mockResolvedValue(null);
      await expect(
        service.submitGamer(12345678, { gamerId: 10 } as any, 42),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('openRoom / closeRoom', () => {
    const roomInfo = {
      id: 12345678,
      owner: { id: 42, username: 'alice' },
      game: {
        id: 1,
        title: 'TicTacToe',
        timeLimit: 1000,
        memoryLimit: 256,
        gamerQuantity: 2,
        disabled: false,
      },
      createAt: Date.now(),
    };

    it('openRoom 应将房间加入开放列表', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      mockRedisClient.hset.mockResolvedValue(1);

      const result = await service.openRoom(12345678, 42);
      expect(result).toBe(1);
      expect(mockRedisClient.hset).toHaveBeenCalled();
    });

    it('openRoom 非房主时抛 ForbiddenException', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ ...roomInfo, owner: { id: 99, username: 'other' } }),
      );
      await expect(service.openRoom(12345678, 42)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('closeRoom 应将房间从开放列表移除', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      mockRedisClient.hdel.mockResolvedValue(1);

      const result = await service.closeRoom(12345678, 42);
      expect(result).toBe(1);
      expect(mockRedisClient.hdel).toHaveBeenCalled();
    });
  });

  describe('startRoom', () => {
    const roomInfo = {
      id: 12345678,
      owner: { id: 42, username: 'alice' },
      game: {
        id: 1,
        title: 'TicTacToe',
        timeLimit: 1000,
        memoryLimit: 256,
        gamerQuantity: 2,
        disabled: false,
      },
      createAt: Date.now(),
    };

    it('管理员可以直接开始房间', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      const players = {
        '0': JSON.stringify({ id: 10, code: 'a', language: 'python3' }),
        '1': JSON.stringify({ id: 11, code: 'b', language: 'cpp' }),
      };
      mockRedisClient.hgetall.mockResolvedValue(players);
      // launchMatch 内部使用 gameRepo.createQueryBuilder
      const gameQb = makeQb({ getOne: jest.fn().mockResolvedValue(gameFixture) });
      mockGameRepo.createQueryBuilder.mockReturnValue(gameQb);
      mockGamerRepo.find.mockResolvedValue([
        { id: 10, code: 'a', language: 'python3', type: 'code' },
        { id: 11, code: 'b', language: 'cpp', type: 'code' },
      ]);
      mockMatchRepo.save.mockResolvedValue({
        id: 100,
        gameId: 1,
        status: MatchStatus.PENDING,
      });
      mockMatchGamerLinkRepo.find = jest.fn().mockResolvedValue([]);
      mockRedisClient.setex.mockResolvedValue('OK');
      const multiMock = makeMulti([
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);
      mockRedisClient.multi.mockReturnValue(multiMock);

      const result = await service.startRoom(12345678, 42, true);
      expect(result.id).toBe(100);
    });

    it('非管理员超额时抛 BadRequestException', async () => {
      mockSettingService.get.mockResolvedValue('3');
      mockRedisService.incr.mockResolvedValue(4); // 超过 maxGame=3
      mockRedisService.ttl.mockResolvedValue(3600);
      mockRedisClient.pexpireat.mockResolvedValue(1);

      await expect(service.startRoom(12345678, 42, false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('位置未填满时抛 BadRequestException', async () => {
      // 不超额
      mockSettingService.get.mockResolvedValue('3');
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisClient.pexpireat.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      // 只有位置 0，没有位置 1
      mockRedisClient.hgetall.mockResolvedValue({
        '0': JSON.stringify({ id: 10 }),
      });
      const multiMock = makeMulti();
      mockRedisClient.multi.mockReturnValue(multiMock);

      await expect(service.startRoom(12345678, 42, false)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('modifyPlayer', () => {
    const roomInfo = {
      id: 12345678,
      owner: { id: 42, username: 'alice' },
      game: {
        id: 1,
        title: 'TicTacToe',
        timeLimit: 1000,
        memoryLimit: 256,
        gamerQuantity: 2,
        disabled: false,
      },
      createAt: Date.now(),
    };

    it('应更新玩家并返回玩家列表', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      mockGamerRepo.findOne.mockResolvedValue(gamerFixture);
      const players = { '0': JSON.stringify(gamerFixture) };
      const multiMock = makeMulti([
        [null, 1],
        [null, players],
      ]);
      mockRedisClient.multi.mockReturnValue(multiMock);

      const result = await service.modifyPlayer(
        12345678,
        { gamerId: 10, index: 0 } as any,
        42,
      );
      expect(result).toEqual(players);
    });

    it('gamer 不存在时抛 NotFoundException', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      mockGamerRepo.findOne.mockResolvedValue(null);
      await expect(
        service.modifyPlayer(12345678, { gamerId: 999, index: 0 } as any, 42),
      ).rejects.toThrow(NotFoundException);
    });

    it('gamer 不属于该游戏时抛 ForbiddenException', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(roomInfo));
      mockGamerRepo.findOne.mockResolvedValue({ ...gamerFixture, gameId: 999 }); // 游戏 ID 不匹配
      await expect(
        service.modifyPlayer(12345678, { gamerId: 10, index: 0 } as any, 42),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── runPlaygroundJudge ──────────────────────────────────────────────────────

  describe('runPlaygroundJudge', () => {
    /** 构造 gameRepo.createQueryBuilder mock，返回含 judgerCode 的 game */
    const mockGameQbWithJudger = (judgerCode = 'game_judge', judgerLanguage = 'python3') => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({
          ...gameFixture,
          judgerCode,
          judgerLanguage,
        }),
      });
      mockGameRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    /** 构造 gamerRepo.createQueryBuilder mock，返回指定 gamer */
    const mockGamerQbWith = (gamer: Partial<typeof gamerFixture>) => {
      const qb = makeQb({
        getOne: jest.fn().mockResolvedValue({ ...gamerFixture, ...gamer }),
      });
      mockGamerRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    beforeEach(() => {
      mockMatchRepo.save.mockResolvedValue({ id: 200, gameId: 1, status: 0, isTest: true });
      mockMatchGamerLinkRepo.save.mockResolvedValue([]);
      mockQueue.add.mockResolvedValue({});
    });

    it('bot0 用 gamerId, bot1 用内联 code，应创建测试对局', async () => {
      // game QB 只被调用一次（用于加载游戏）；gamer0 QB 用于加载已有 gamer
      mockGameRepo.createQueryBuilder.mockReturnValue(
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, judgerCode: 'game_judge', judgerLanguage: 'python3' }) }),
      );
      // bot0: 通过 gamerId 加载（用 gamerRepo.createQueryBuilder）
      const gamer0 = { ...gamerFixture, id: 10, code: 'print("hi")', language: 'python3', type: 'code', webhookUrl: null, webhookSecret: null };
      // bot1: 内联代码 → 临时创建
      const testGamer1 = { ...gamerFixture, id: 55, code: 'pass', language: 'cpp17', type: 'code', isTest: true, webhookUrl: null, webhookSecret: null };

      // createQueryBuilder 首次返回 game，第二次返回 gamer0
      // 但因为 Promise.all 同时执行两个 resolveBot，第一个是 gamerId 分支（走 createQueryBuilder），
      // 第二个是 code 分支（走 create/save）。先设置 game 的 QB，然后 gamer QB。
      let qbCallCount = 0;
      mockGameRepo.createQueryBuilder.mockImplementation(() => {
        return makeQb({
          getOne: jest.fn().mockResolvedValue({ ...gameFixture, judgerCode: 'game_judge', judgerLanguage: 'python3' }),
        });
      });
      mockGamerRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ getOne: jest.fn().mockResolvedValue(gamer0) }),
      );
      mockGamerRepo.create.mockReturnValue(testGamer1);
      mockGamerRepo.save.mockResolvedValue(testGamer1);

      const dto = {
        bot0: { gamerId: 10 },
        bot1: { code: 'pass', language: 'cpp17' },
      };

      const result = await service.runPlaygroundJudge(1, 42, dto as any);
      expect(result.matchId).toBe(200);
      expect(result.testGamerIds).toContain(55);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'compete',
        expect.objectContaining({ matchId: 200 }),
      );
    });

    it('提供 judgerCode 时覆盖游戏自带裁判', async () => {
      mockGameRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, judgerCode: 'game_judge', judgerLanguage: 'python3' }) }),
      );
      const gamer0 = { ...gamerFixture, id: 10, code: 'a', language: 'python3', type: 'code', webhookUrl: null, webhookSecret: null };
      const gamer1 = { ...gamerFixture, id: 11, code: 'b', language: 'cpp17', type: 'code', webhookUrl: null, webhookSecret: null };
      // 两个 bot 都通过 gamerId 提供
      let gamerQbCallCount = 0;
      mockGamerRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({
          getOne: jest.fn().mockImplementation(() =>
            Promise.resolve(gamerQbCallCount++ === 0 ? gamer0 : gamer1),
          ),
        }),
      );

      const dto = {
        judgerCode: 'custom_judge_code',
        judgerLanguage: 'cpp17',
        bot0: { gamerId: 10 },
        bot1: { gamerId: 11 },
      };

      await service.runPlaygroundJudge(1, 42, dto as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'compete',
        expect.objectContaining({
          game: expect.objectContaining({
            judgerCode: 'custom_judge_code',
            judgerLanguage: 'cpp17',
          }),
        }),
      );
    });

    it('不提供 judgerCode 时使用游戏自带裁判', async () => {
      mockGameRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, judgerCode: 'game_judge', judgerLanguage: 'python3' }) }),
      );
      const gamer0 = { ...gamerFixture, id: 10, code: 'a', language: 'python3', type: 'code', webhookUrl: null, webhookSecret: null };
      const gamer1 = { ...gamerFixture, id: 11, code: 'b', language: 'cpp17', type: 'code', webhookUrl: null, webhookSecret: null };
      let gamerQbCallCount = 0;
      mockGamerRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({
          getOne: jest.fn().mockImplementation(() =>
            Promise.resolve(gamerQbCallCount++ === 0 ? gamer0 : gamer1),
          ),
        }),
      );

      const dto = {
        // judgerCode 未提供
        bot0: { gamerId: 10 },
        bot1: { gamerId: 11 },
      };

      await service.runPlaygroundJudge(1, 42, dto as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'compete',
        expect.objectContaining({
          game: expect.objectContaining({
            judgerCode: 'game_judge',
            judgerLanguage: 'python3',
          }),
        }),
      );
    });

    it('游戏不存在时抛 NotFoundException', async () => {
      mockGameRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ getOne: jest.fn().mockResolvedValue(null) }),
      );
      await expect(
        service.runPlaygroundJudge(999, 42, { bot0: { gamerId: 1 }, bot1: { gamerId: 2 } } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('bot 未提供 gamerId 或 code 时抛 BadRequestException', async () => {
      mockGameRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, judgerCode: 'j', judgerLanguage: 'py' }) }),
      );
      const dto = {
        bot0: {}, // 两者都没有
        bot1: { gamerId: 11 },
      };
      await expect(
        service.runPlaygroundJudge(1, 42, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('bot 提供 code 但未提供 language 时抛 BadRequestException', async () => {
      mockGameRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ getOne: jest.fn().mockResolvedValue({ ...gameFixture, judgerCode: 'j', judgerLanguage: 'py' }) }),
      );
      const dto = {
        bot0: { code: 'print()', language: 'python3' },
        bot1: { code: 'print()' }, // 缺 language
      };
      await expect(
        service.runPlaygroundJudge(1, 42, dto as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
