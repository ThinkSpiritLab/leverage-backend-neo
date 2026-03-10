/**
 * Tests for CompeteService.handleMatchCallback + updateElo
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CompeteService, MatchStatus } from './compete.service';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';
import { MatchGamerLink } from '../../database/entities/match-gamer-link.entity';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { RedisService } from '../redis/redis.service';
import { SettingService } from '../setting/setting.service';
import { HumanTurnService } from './human-turn.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRepo = (overrides: Record<string, any> = {}) => ({
  findOne: jest.fn(),
  findBy: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findAndCount: jest.fn(),
  findOneOrFail: jest.fn(),
  createQueryBuilder: jest.fn(),
  delete: jest.fn(),
  ...overrides,
});

const makeRedisClient = () => ({
  multi: jest.fn().mockReturnValue({
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
    exec: jest.fn().mockResolvedValue([]),
  }),
  hgetall: jest.fn().mockResolvedValue({}),
  hset: jest.fn().mockResolvedValue(1),
  hexists: jest.fn().mockResolvedValue(0),
  setex: jest.fn().mockResolvedValue('OK'),
  pexpireat: jest.fn().mockResolvedValue(1),
  hdel: jest.fn().mockResolvedValue(1),
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeGamer = (id: number, elo = 1200): Gamer =>
  ({ id, userId: id, gameId: 1, title: `Bot${id}`, language: 'cpp17', opensource: false, code: '', elo, eloExternal: elo, type: 'code' } as any);

const makeMatch = (overrides: Partial<Match> = {}): Match =>
  ({
    id: 1,
    gameId: 1,
    status: MatchStatus.RUNNING,
    externalJobId: 'bz-game-42',
    result: null,
    score: [],
    links: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any);

// ─── Test module bootstrap ────────────────────────────────────────────────────

async function buildService() {
  let mockGameRepo: any;
  let mockGamerRepo: any;
  let mockMatchRepo: any;
  let mockMatchGamerLinkRepo: any;
  let mockQueue: any;
  let mockDataSource: any;
  let mockRedisService: any;

  mockGameRepo = makeRepo();
  mockGamerRepo = makeRepo();
  mockMatchRepo = makeRepo();
  mockMatchGamerLinkRepo = makeRepo();
  mockQueue = { add: jest.fn().mockResolvedValue({}) };
  mockDataSource = { query: jest.fn(), createQueryBuilder: jest.fn() };
  const client = makeRedisClient();
  mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    ttl: jest.fn(),
    getClient: jest.fn().mockReturnValue(client),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CompeteService,
      { provide: getRepositoryToken(Game), useValue: mockGameRepo },
      { provide: getRepositoryToken(Gamer), useValue: mockGamerRepo },
      { provide: getRepositoryToken(Match), useValue: mockMatchRepo },
      { provide: getRepositoryToken(MatchGamerLink), useValue: mockMatchGamerLinkRepo },
      { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: mockQueue },
      { provide: DataSource, useValue: mockDataSource },
      { provide: RedisService, useValue: mockRedisService },
      { provide: SettingService, useValue: { get: jest.fn() } },
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      {
        provide: HumanTurnService,
        useValue: {
          notifyGameOver: jest.fn(),
          waitForTurn: jest.fn(),
          submitResponse: jest.fn(),
          registerSSEClient: jest.fn(),
          unregisterSSEClient: jest.fn(),
          replayPendingTurn: jest.fn(),
        },
      },
    ],
  }).compile();

  const service = module.get<CompeteService>(CompeteService);
  return { service, mockMatchRepo, mockGamerRepo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompeteService.handleMatchCallback', () => {
  let service: CompeteService;
  let mockMatchRepo: any;
  let mockGamerRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ service, mockMatchRepo, mockGamerRepo } = await buildService());
  });

  // ─── 未知 jobId ──────────────────────────────────────────────────────────

  it('jobId 未找到对应 match → 返回 ok=false', async () => {
    mockMatchRepo.findOne.mockResolvedValue(null);
    const result = await service.handleMatchCallback('unknown-job', 'finished', undefined);
    expect(result).toEqual({ ok: false });
    expect(mockMatchRepo.update).not.toHaveBeenCalled();
  });

  // ─── 幂等性 ──────────────────────────────────────────────────────────────

  it('match 已 FINISHED → 幂等跳过，返回 ok=true', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch({ status: MatchStatus.FINISHED }));
    const result = await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      finalResult: { '101': 5, '102': 3 },
    });
    expect(result).toEqual({ ok: true });
    expect(mockMatchRepo.update).not.toHaveBeenCalled();
  });

  it('match 已 ERROR → 幂等跳过，返回 ok=true', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch({ status: MatchStatus.ERROR }));
    const result = await service.handleMatchCallback('bz-game-42', 'failed', undefined);
    expect(result).toEqual({ ok: true });
    expect(mockMatchRepo.update).not.toHaveBeenCalled();
  });

  // ─── 中间状态 ─────────────────────────────────────────────────────────────

  it('非 terminal 状态（running）→ 不更新 DB，返回 ok=true', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    const result = await service.handleMatchCallback('bz-game-42', 'running', undefined);
    expect(result).toEqual({ ok: true });
    expect(mockMatchRepo.update).not.toHaveBeenCalled();
  });

  // ─── 成功完成 ─────────────────────────────────────────────────────────────

  it('state=finished → status=FINISHED, result 落库，ELO 更新', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    mockMatchRepo.update.mockResolvedValue(undefined);

    const gamer1 = makeGamer(101, 1200);
    const gamer2 = makeGamer(102, 1200);
    mockGamerRepo.findBy.mockResolvedValue([gamer1, gamer2]);
    mockGamerRepo.update.mockResolvedValue(undefined);

    const result = await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      rounds: [{ r: 1 }, { r: 2 }],
      finalResult: { '101': 10, '102': 0 },
    });

    expect(result).toEqual({ ok: true });

    // Match update
    expect(mockMatchRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: MatchStatus.FINISHED,
        result: expect.stringContaining('finalResult'),
      }),
    );

    // ELO update should have been called for each gamer
    expect(mockGamerRepo.update).toHaveBeenCalledTimes(2);
  });

  it('state=failed → status=ERROR，不触发 ELO 更新', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    mockMatchRepo.update.mockResolvedValue(undefined);

    const result = await service.handleMatchCallback('bz-game-42', 'failed', undefined);

    expect(result).toEqual({ ok: true });
    expect(mockMatchRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: MatchStatus.ERROR }),
    );
    // No ELO update on failure
    expect(mockGamerRepo.update).not.toHaveBeenCalled();
  });

  it('result 落库包含 roundCount', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    mockMatchRepo.update.mockResolvedValue(undefined);
    mockGamerRepo.findBy.mockResolvedValue([makeGamer(101), makeGamer(102)]);
    mockGamerRepo.update.mockResolvedValue(undefined);

    await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      rounds: [{ r: 1 }, { r: 2 }, { r: 3 }],
      finalResult: { '101': 1, '102': 0 },
    });

    const updateCall = mockMatchRepo.update.mock.calls[0];
    const resultJson = JSON.parse(updateCall[1].result);
    expect(resultJson.roundCount).toBe(3);
    expect(resultJson.verdict).toBe('Accepted');
    expect(resultJson.finalResult).toEqual({ '101': 1, '102': 0 });
  });
});

// ─── ELO calculation tests ───────────────────────────────────────────────────

describe('CompeteService.updateElo (via handleMatchCallback)', () => {
  let service: CompeteService;
  let mockMatchRepo: any;
  let mockGamerRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ service, mockMatchRepo, mockGamerRepo } = await buildService());
  });

  const setupMatch = () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    mockMatchRepo.update.mockResolvedValue(undefined);
    mockGamerRepo.update.mockResolvedValue(undefined);
  };

  it('等分时：ELO 双方各变化接近 0（不超过 K/2）', async () => {
    setupMatch();
    const gamer1 = makeGamer(101, 1200);
    const gamer2 = makeGamer(102, 1200);
    mockGamerRepo.findBy.mockResolvedValue([gamer1, gamer2]);

    await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      finalResult: { '101': 5, '102': 5 }, // tie
    });

    // K*(0.5 - 0.5) = 0 → ELO unchanged (or rounds to same)
    const calls = mockGamerRepo.update.mock.calls;
    expect(calls).toHaveLength(2);
    const elos = calls.map((c: any[]) => c[1].elo);
    elos.forEach((elo: number) => expect(elo).toBe(1200));
  });

  it('胜者 ELO 增加，败者 ELO 减少（K=32，等分起点）', async () => {
    setupMatch();
    const winner = makeGamer(101, 1200);
    const loser = makeGamer(102, 1200);
    mockGamerRepo.findBy.mockResolvedValue([winner, loser]);

    await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      finalResult: { '101': 10, '102': 0 }, // 101 wins
    });

    const calls = mockGamerRepo.update.mock.calls;
    const eloByGamer = new Map<number, number>(
      calls.map((c: any[]) => [c[0], c[1].elo]),
    );

    // Expected: K * (1 - 0.5) = 16 → winner: 1216, loser: 1184
    expect(eloByGamer.get(101)).toBe(1216);
    expect(eloByGamer.get(102)).toBe(1184);
  });

  it('ELO 不会低于 0', async () => {
    setupMatch();
    const underdog = makeGamer(101, 0); // already at 0
    const dominant = makeGamer(102, 3000);
    mockGamerRepo.findBy.mockResolvedValue([underdog, dominant]);

    await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      finalResult: { '101': 0, '102': 100 }, // underdog loses
    });

    const calls = mockGamerRepo.update.mock.calls;
    const underdogCall = calls.find((c: any[]) => c[0] === 101);
    expect(underdogCall[1].elo).toBeGreaterThanOrEqual(0);
  });

  it('finalResult 只有 1 个 gamer 时不更新 ELO', async () => {
    setupMatch();
    mockGamerRepo.findBy.mockResolvedValue([makeGamer(101)]);

    await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      finalResult: { '101': 10 },
    });

    expect(mockGamerRepo.update).not.toHaveBeenCalled();
  });

  it('finalResult 为空时不更新 ELO', async () => {
    setupMatch();

    await service.handleMatchCallback('bz-game-42', 'finished', {
      verdict: 'Accepted',
      finalResult: {},
    });

    expect(mockGamerRepo.update).not.toHaveBeenCalled();
  });
});
