/**
 * Tests for internal match settlement and ELO
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
  mockGamerRepo.find.mockImplementation((options: any) => mockGamerRepo.findBy(options.where));
  mockDataSource = { query: jest.fn(), createQueryBuilder: jest.fn(), transaction: jest.fn(async fn => fn({
    getRepository: (entity: unknown) => entity === Match ? mockMatchRepo : entity === Gamer ? mockGamerRepo : mockMatchGamerLinkRepo,
    query: (...args: any[]) => mockDataSource.query(...args),
  })) };
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

// Internal worker settlement: same locked result/ELO path, no external callback.
describe('CompeteService.completeInternalMatch', () => {
  const finished = (scores: Record<string, number>, rounds: Record<string, unknown>[] = []) => ({
    status: 'finished' as const, verdict: 'OK', finalResult: scores, rounds, compileMessages: {},
  });
  let service: CompeteService;
  let mockMatchRepo: any;
  let mockGamerRepo: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    ({ service, mockMatchRepo, mockGamerRepo } = await buildService());
  });

  it('returns ok=false for a missing match without changing ratings', async () => {
    mockMatchRepo.findOne.mockResolvedValue(null);
    expect(await service.completeInternalMatch(1, finished({ '101': 5, '102': 3 }))).toEqual({ ok: false });
    expect(mockGamerRepo.update).not.toHaveBeenCalled();
  });

  it.each([MatchStatus.FINISHED, MatchStatus.ERROR])('ignores duplicate settlement when match is already %s', async status => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch({ status }));
    expect(await service.completeInternalMatch(1, finished({ '101': 5, '102': 3 }))).toEqual({ ok: true });
    expect(mockMatchRepo.update).not.toHaveBeenCalled();
    expect(mockGamerRepo.update).not.toHaveBeenCalled();
  });

  it('persists winner, rounds, and changes both code-bot ELO ratings once', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    mockGamerRepo.findBy.mockResolvedValue([makeGamer(101), makeGamer(102)]);
    mockGamerRepo.find.mockResolvedValue([makeGamer(101), makeGamer(102)]);
    expect(await service.completeInternalMatch(1, finished({ '101': 10, '102': 0 }, [{ round: 1 }, { round: 2 }]))).toEqual({ ok: true });
    expect(mockMatchRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: MatchStatus.FINISHED }));
    const result = JSON.parse(mockMatchRepo.update.mock.calls[0][1].result);
    expect(result.roundCount).toBe(2);
    expect(result.finalResult).toEqual({ '101': 10, '102': 0 });
    const ratings = new Map(mockGamerRepo.update.mock.calls.map(([id, value]: [number, { elo: number }]) => [id, value.elo]));
    expect(ratings.get(101)).toBe(1216);
    expect(ratings.get(102)).toBe(1184);
  });

  it('ties leave equal ratings unchanged', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    mockGamerRepo.findBy.mockResolvedValue([makeGamer(101), makeGamer(102)]);
    mockGamerRepo.find.mockResolvedValue([makeGamer(101), makeGamer(102)]);
    await service.completeInternalMatch(1, finished({ '101': 5, '102': 5 }));
    for (const [, value] of mockGamerRepo.update.mock.calls) expect(value.elo).toBe(1200);
  });

  it('an error or incomplete score does not change ELO', async () => {
    mockMatchRepo.findOne.mockResolvedValue(makeMatch());
    await service.completeInternalMatch(1, { ...finished({}), status: 'error', verdict: 'SE', error: 'runtime failure' });
    expect(mockMatchRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: MatchStatus.ERROR }));
    expect(mockGamerRepo.update).not.toHaveBeenCalled();
  });
});
