import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BotzoneClientService } from './botzone-client.service';
import { JudgeProviderName } from '../judge-provider/judge-provider.interface';
import { Status } from '../heng/heng.types';

// ─── Mock axios ──────────────────────────────────────────────────────────────

jest.mock('axios', () => {
  const mockAxiosInstance = {
    post: jest.fn(),
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => mockAxiosInstance),
    // expose the instance for test assertions
    __mockInstance: mockAxiosInstance,
  };
});

const mockAxiosInstance = (axios as any).__mockInstance as {
  post: jest.Mock;
  get: jest.Mock;
};

// ─── Config mock ─────────────────────────────────────────────────────────────

const configValues: Record<string, unknown> = {
  'botzone.baseUrl': 'http://botzone-test.local',
  'botzone.apiKey': 'test-api-key',
  'botzone.defaultProblemId': 'prob-001',
  baseUrl: 'http://oj-test.local:3000',
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: unknown) => configValues[key] ?? defaultVal),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BotzoneClientService', () => {
  let service: BotzoneClientService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotzoneClientService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<BotzoneClientService>(BotzoneClientService);
  });

  // ─── Provider identity ───────────────────────────────────────────────────

  it('name is JudgeProviderName.Botzone', () => {
    expect(service.name).toBe(JudgeProviderName.Botzone);
  });

  // ─── enqueue ─────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    const baseParams = {
      submissionId: 42,
      language: 3, // cpp17
      code: '#include <bits/stdc++.h>\nint main(){}',
      timeLimit: 1000,
      memoryLimit: 256,
      testDataUrl: 'http://oj-test.local:3000/problems/7/test-data',
    };

    beforeEach(() => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { jobId: 'bz-job-001', queuePosition: 3 },
      });
    });

    it('returns externalJobId from response', async () => {
      const result = await service.enqueue(baseParams);
      expect(result.externalJobId).toBe('bz-job-001');
    });

    it('includes providerMeta with language and problemId', async () => {
      const result = await service.enqueue(baseParams);
      expect(result.providerMeta).toMatchObject({
        problemId: 'prob-001',
        language: 'cpp17',
      });
    });

    it('uses externalProblemId override when provided', async () => {
      await service.enqueue({ ...baseParams, externalProblemId: 'prob-custom' });
      const body = mockAxiosInstance.post.mock.calls[0][1];
      expect(body.problemId).toBe('prob-custom');
    });

    it('encodes code as base64', async () => {
      await service.enqueue(baseParams);
      const body = mockAxiosInstance.post.mock.calls[0][1];
      const decoded = Buffer.from(body.sourceCode, 'base64').toString('utf-8');
      expect(decoded).toBe(baseParams.code);
    });

    it('sets callbackUrl to /botzone/callback', async () => {
      await service.enqueue(baseParams);
      const body = mockAxiosInstance.post.mock.calls[0][1];
      expect(body.callbackUrl).toBe('http://oj-test.local:3000/botzone/callback');
    });

    it('sets correlationId to string of submissionId', async () => {
      await service.enqueue(baseParams);
      const body = mockAxiosInstance.post.mock.calls[0][1];
      expect(body.correlationId).toBe('42');
    });

    it('maps language 6 (Java) to "java"', async () => {
      await service.enqueue({ ...baseParams, language: 6 });
      const body = mockAxiosInstance.post.mock.calls[0][1];
      expect(body.language).toBe('java');
    });

    it('falls back to "cpp17" for unknown language codes', async () => {
      await service.enqueue({ ...baseParams, language: 999 });
      const body = mockAxiosInstance.post.mock.calls[0][1];
      expect(body.language).toBe('cpp17');
    });

    it('throws when axios.post rejects', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('network error'));
      await expect(service.enqueue(baseParams)).rejects.toThrow('network error');
    });
  });

  // ─── poll ─────────────────────────────────────────────────────────────────

  describe('poll', () => {
    it('returns done=false for running state', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-1', state: 'running', type: 'oj' },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(false);
      expect(result.status).toBe(Status.JUDGING);
    });

    it('returns done=false for pending state', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-1', state: 'pending', type: 'oj' },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(false);
      expect(result.status).toBe(Status.PENDING);
    });

    it('returns done=false for compiling state', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-1', state: 'compiling', type: 'oj' },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(false);
      expect(result.status).toBe(Status.COMPILING);
    });

    it('returns done=true with AC for finished OJ result with Accepted verdict', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          jobId: 'bz-1',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'Accepted',
            testcases: [
              { id: 1, verdict: 'Accepted', timeMs: 100, memoryKb: 2048 },
              { id: 2, verdict: 'Accepted', timeMs: 150, memoryKb: 3000 },
            ],
          },
        },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.AC);
      expect(result.time).toBe(150); // max timeMs
      expect(result.memory).toBe(3000); // max memoryKb
    });

    it('maps OJ testcases to judgeResult JSON', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          jobId: 'bz-2',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'WrongAnswer',
            testcases: [
              { id: 1, verdict: 'Accepted', timeMs: 50, memoryKb: 1024, actualOutput: 'ok' },
              { id: 2, verdict: 'WrongAnswer', timeMs: 60, memoryKb: 1200, actualOutput: 'bad', message: 'expected 1' },
            ],
          },
        },
      });
      const result = await service.poll(2, 'bz-2');
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.WA);
      const jr = JSON.parse(result.judgeResult!);
      expect(jr.testcases).toHaveLength(2);
      expect(jr.testcases[0]).toMatchObject({ id: 1, verdict: 'Accepted', time: 50, memory: 1024, actualOutput: 'ok' });
      expect(jr.testcases[1]).toMatchObject({ id: 2, verdict: 'WrongAnswer', time: 60, memory: 1200, actualOutput: 'bad', message: 'expected 1' });
    });

    it('returns done=true with CE and compileErrorMsg for CompileError', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          jobId: 'bz-3',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'CompileError',
            testcases: [],
            compile: { verdict: 'Error', message: 'undeclared identifier x' },
          },
        },
      });
      const result = await service.poll(3, 'bz-3');
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.CE);
      expect(result.compileErrorMsg).toBe('undeclared identifier x');
    });

    it('returns done=true with SE for failed state', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-4', state: 'failed', type: 'oj', failedReason: 'internal error' },
      });
      const result = await service.poll(4, 'bz-4');
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.SE);
    });

    it('calls GET /api/judger/submission/:jobId', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-x', state: 'running', type: 'oj' },
      });
      await service.poll(99, 'bz-x');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/judger/submission/bz-x',
      );
    });
  });

  // ─── mapCallback ──────────────────────────────────────────────────────────

  describe('mapCallback', () => {
    // ─── OJ callbacks ──────────────────────────────────────────────────────

    describe('OJ type', () => {
      it('maps finished/Accepted callback to done=true, status=AC', () => {
        const result = service.mapCallback({
          jobId: 'j1',
          correlationId: '10',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'Accepted',
            testcases: [
              { id: 1, verdict: 'Accepted', timeMs: 500, memoryKb: 4096 },
            ],
          },
        });
        expect(result.done).toBe(true);
        expect(result.status).toBe(Status.AC);
        expect(result.time).toBe(500);
        expect(result.memory).toBe(4096);
      });

      it('maps running callback to done=false', () => {
        const result = service.mapCallback({
          jobId: 'j2',
          correlationId: '11',
          state: 'running',
          type: 'oj',
        });
        expect(result.done).toBe(false);
        expect(result.status).toBe(Status.JUDGING);
      });

      it('maps finished/WrongAnswer to done=true, status=WA', () => {
        const result = service.mapCallback({
          jobId: 'j3',
          correlationId: '12',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'WrongAnswer',
            testcases: [
              { id: 1, verdict: 'Accepted', timeMs: 10, memoryKb: 256 },
              { id: 2, verdict: 'WrongAnswer', timeMs: 20, memoryKb: 512, actualOutput: 'wrong' },
            ],
          },
        });
        expect(result.done).toBe(true);
        expect(result.status).toBe(Status.WA);
      });

      it('builds correct judgeResult JSON for OJ testcases', () => {
        const result = service.mapCallback({
          jobId: 'j4',
          correlationId: '13',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'Accepted',
            testcases: [
              { id: 1, verdict: 'Accepted', timeMs: 100, memoryKb: 1024, actualOutput: 'hello', message: undefined },
              { id: 2, verdict: 'Accepted', timeMs: 200, memoryKb: 2048 },
            ],
          },
        });
        expect(result.judgeResult).toBeDefined();
        const jr = JSON.parse(result.judgeResult!);
        expect(jr.testcases).toHaveLength(2);
        expect(jr.testcases[0]).toMatchObject({ id: 1, verdict: 'Accepted', time: 100, memory: 1024, actualOutput: 'hello' });
        expect(jr.testcases[1]).toMatchObject({ id: 2, verdict: 'Accepted', time: 200, memory: 2048 });
      });

      it('sets compileErrorMsg when verdict is CompileError', () => {
        const result = service.mapCallback({
          jobId: 'j5',
          correlationId: '14',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'CompileError',
            testcases: [],
            compile: { verdict: 'Error', message: 'syntax error at line 3' },
          },
        });
        expect(result.done).toBe(true);
        expect(result.status).toBe(Status.CE);
        expect(result.compileErrorMsg).toBe('syntax error at line 3');
      });

      it('does not set compileErrorMsg when verdict is not CE', () => {
        const result = service.mapCallback({
          jobId: 'j6',
          correlationId: '15',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'Accepted',
            testcases: [{ id: 1, verdict: 'Accepted', timeMs: 10, memoryKb: 256 }],
          },
        });
        expect(result.compileErrorMsg).toBeUndefined();
      });
    });

    // ─── Botzone game callbacks ────────────────────────────────────────────

    describe('botzone game type', () => {
      const gameResult = {
        verdict: 'Accepted',
        rounds: [{ round: 1, moves: ['a1', 'b2'] }, { round: 2, moves: ['c3'] }],
        finalResult: { bot1: 10, bot2: 5 },
      };

      it('maps finished game callback to done=true, status=AC', () => {
        const result = service.mapCallback({
          jobId: 'g1',
          correlationId: '20',
          state: 'finished',
          type: 'botzone',
          result: gameResult,
        });
        expect(result.done).toBe(true);
        expect(result.status).toBe(Status.AC);
      });

      it('stores verdict+finalResult in judgeResult JSON', () => {
        const result = service.mapCallback({
          jobId: 'g1',
          correlationId: '20',
          state: 'finished',
          type: 'botzone',
          result: gameResult,
        });
        const jr = JSON.parse(result.judgeResult!);
        expect(jr.verdict).toBe('Accepted');
        expect(jr.finalResult).toEqual({ bot1: 10, bot2: 5 });
      });

      it('stores rounds+finalResult in providerMeta.gameLog', () => {
        const result = service.mapCallback({
          jobId: 'g1',
          correlationId: '20',
          state: 'finished',
          type: 'botzone',
          result: gameResult,
        });
        expect(result.providerMeta).toBeDefined();
        const gameLog = (result.providerMeta as any).gameLog;
        expect(gameLog.rounds).toEqual(gameResult.rounds);
        expect(gameLog.finalResult).toEqual({ bot1: 10, bot2: 5 });
      });

      it('handles missing rounds gracefully (empty array)', () => {
        const result = service.mapCallback({
          jobId: 'g2',
          correlationId: '21',
          state: 'finished',
          type: 'botzone',
          result: { verdict: 'WrongAnswer', finalResult: { bot1: 0, bot2: 10 } },
        });
        const gameLog = (result.providerMeta as any).gameLog;
        expect(gameLog.rounds).toEqual([]);
      });

      it('handles missing finalResult gracefully (empty object)', () => {
        const result = service.mapCallback({
          jobId: 'g3',
          correlationId: '22',
          state: 'finished',
          type: 'botzone',
          result: { verdict: 'Accepted', rounds: [] },
        });
        const gameLog = (result.providerMeta as any).gameLog;
        expect(gameLog.finalResult).toEqual({});
        const jr = JSON.parse(result.judgeResult!);
        expect(jr.finalResult).toEqual({});
      });

      it('OJ result has no providerMeta', () => {
        const result = service.mapCallback({
          jobId: 'j7',
          correlationId: '30',
          state: 'finished',
          type: 'oj',
          result: {
            verdict: 'Accepted',
            testcases: [{ id: 1, verdict: 'Accepted', timeMs: 10, memoryKb: 256 }],
          },
        });
        expect(result.providerMeta).toBeUndefined();
      });
    });

    // ─── Failed state ──────────────────────────────────────────────────────

    it('maps failed state to done=true, status=SE', () => {
      const result = service.mapCallback({
        jobId: 'f1',
        correlationId: '99',
        state: 'failed',
        type: 'oj',
      });
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.SE);
    });
  });
});
