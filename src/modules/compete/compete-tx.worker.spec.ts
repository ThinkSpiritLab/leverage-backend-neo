import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Job } from 'bull';
import axios from 'axios';
import { getQueueToken } from '@nestjs/bull';
import { CompeteTxWorker, CompeteTxPayload } from './compete-tx.worker';
import { Match } from '../../database/entities/match.entity';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { MatchStatus } from './compete.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockMatchRepo = {
  update: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'botzone.baseUrl') return 'http://botzone-neo:5000';
    if (key === 'botzone.apiKey') return 'test-api-key';
    if (key === 'baseUrl') return 'http://testserver:3000';
    if (key === 'botzone.callbackToken') return '';
    return def;
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPayload(overrides: Partial<CompeteTxPayload> = {}): CompeteTxPayload {
  return {
    matchId: 7,
    game: {
      judgerCode: 'judger source code',
      judgerLanguage: 'cpp17',
      timeLimit: 1000,
      memoryLimit: 256,
    },
    gamers: [
      { id: 101, code: 'bot A code', language: 'cpp17' },
      { id: 102, code: 'bot B code', language: 'python3' },
    ],
    ...overrides,
  };
}

function buildJob(data: CompeteTxPayload): Job<CompeteTxPayload> {
  return { id: 'job-1', data } as unknown as Job<CompeteTxPayload>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompeteTxWorker', () => {
  let worker: CompeteTxWorker;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompeteTxWorker,
        { provide: getRepositoryToken(Match), useValue: mockMatchRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: {} },
      ],
    }).compile();

    worker = module.get<CompeteTxWorker>(CompeteTxWorker);
  });

  // ─── 正常流程 ────────────────────────────────────────────────────────────

  describe('正常流程', () => {
    it('成功时：POST 到 botzone-neo /v1/judge，更新 match RUNNING + externalJobId', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { jobId: 'bz-game-77' } });
      mockMatchRepo.update.mockResolvedValue(undefined);

      const payload = buildPayload();
      await worker.handle(buildJob(payload));

      // Should call botzone-neo with correct URL
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://botzone-neo:5000/v1/judge',
        expect.objectContaining({
          type: 'botzone',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
        }),
      );

      // Should update match with externalJobId and RUNNING status
      expect(mockMatchRepo.update).toHaveBeenCalledWith(payload.matchId, {
        externalJobId: 'bz-game-77',
        status: MatchStatus.RUNNING,
      });
    });

    it('请求体包含正确的 judger 和 bots', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { jobId: 'bz-x' } });
      mockMatchRepo.update.mockResolvedValue(undefined);

      const payload = buildPayload();
      await worker.handle(buildJob(payload));

      const body = (mockedAxios.post as jest.Mock).mock.calls[0][1];

      // 使用 game-dict 格式：game.judger 包含 source 和 language
      expect(body.game).toBeDefined();
      expect(body.game.judger).toMatchObject({
        language: 'cpp17',
        source: Buffer.from('judger source code', 'utf-8').toString('base64'),
      });

      // bots 以 game["0"] / game["1"] 格式传入
      expect(body.game['0']).toMatchObject({
        language: 'cpp17',
        source: Buffer.from('bot A code', 'utf-8').toString('base64'),
      });
      expect(body.game['1']).toMatchObject({
        language: 'python3',
        source: Buffer.from('bot B code', 'utf-8').toString('base64'),
      });
    });

    it('timeLimit 和 memoryLimit 正确透传', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { jobId: 'bz-y' } });
      mockMatchRepo.update.mockResolvedValue(undefined);

      const payload = buildPayload({
        game: {
          judgerCode: 'j',
          judgerLanguage: 'cpp17',
          timeLimit: 2000,
          memoryLimit: 512,
        },
      });
      await worker.handle(buildJob(payload));

      const body = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      // timeLimit and memoryLimit are embedded in game.judger.limit and game["N"].limit
      expect(body.game.judger.limit.time).toBe(2000);
      expect(body.game.judger.limit.memory).toBe(512);
    });

    it('callback URL 包含 matchId', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { jobId: 'bz-z' } });
      mockMatchRepo.update.mockResolvedValue(undefined);

      const payload = buildPayload({ matchId: 42 });
      await worker.handle(buildJob(payload));

      const body = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      expect(body.callback.finish).toContain('/compete/match-callback/42');
    });

    it('runMode 为 restart', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { jobId: 'bz-r' } });
      mockMatchRepo.update.mockResolvedValue(undefined);

      await worker.handle(buildJob(buildPayload()));

      const body = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      expect(body.runMode).toBe('restart');
    });
  });

  // ─── 失败流程 ────────────────────────────────────────────────────────────

  describe('失败流程', () => {
    it('botzone 返回错误时：match 状态设为 ERROR，re-throw 给 Bull', async () => {
      const err = new Error('botzone connection refused');
      mockedAxios.post = jest.fn().mockRejectedValue(err);
      mockMatchRepo.update.mockResolvedValue(undefined);

      await expect(worker.handle(buildJob(buildPayload()))).rejects.toThrow(
        'botzone connection refused',
      );

      expect(mockMatchRepo.update).toHaveBeenCalledWith(
        buildPayload().matchId,
        { status: MatchStatus.ERROR },
      );
    });

    it('axios 调用失败时：match 状态设为 ERROR，re-throw 给 Bull', async () => {
      const err = new Error('network error');
      mockedAxios.post = jest.fn().mockRejectedValue(err);
      mockMatchRepo.update.mockResolvedValue(undefined);

      await expect(worker.handle(buildJob(buildPayload()))).rejects.toThrow('network error');

      expect(mockMatchRepo.update).toHaveBeenCalledWith(
        buildPayload().matchId,
        { status: MatchStatus.ERROR },
      );
    });
  });
});
