import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BotzoneClientService } from './botzone-client.service';
import { JudgeProviderName } from '../judge-provider/judge-provider.interface';
import { BotzoneJobStatus } from './botzone.types';
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
    it('returns done=false for Running status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-1', status: BotzoneJobStatus.Running },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(false);
      expect(result.status).toBe(Status.JUDGING);
    });

    it('returns done=false for Pending status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-1', status: BotzoneJobStatus.Pending },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(false);
    });

    it('returns done=true with AC for Accepted status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-1', status: BotzoneJobStatus.Accepted, time: 123, memory: 65536 },
      });
      const result = await service.poll(1, 'bz-1');
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.AC);
      expect(result.time).toBe(123);
      expect(result.memory).toBe(65536);
    });

    it('returns done=true with CE for CompileError', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          jobId: 'bz-2',
          status: BotzoneJobStatus.CompileError,
          compileErrorMsg: 'error: undeclared identifier',
        },
      });
      const result = await service.poll(2, 'bz-2');
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.CE);
      expect(result.compileErrorMsg).toBe('error: undeclared identifier');
    });

    it('calls GET /api/judger/submission/:jobId', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { jobId: 'bz-x', status: BotzoneJobStatus.Running },
      });
      await service.poll(99, 'bz-x');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/judger/submission/bz-x',
      );
    });
  });

  // ─── mapCallback ──────────────────────────────────────────────────────────

  describe('mapCallback', () => {
    it('maps Accepted callback to done=true, status=AC', () => {
      const result = service.mapCallback({
        jobId: 'j1',
        correlationId: '10',
        status: BotzoneJobStatus.Accepted,
        time: 500,
        memory: 131072,
      });
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.AC);
      expect(result.time).toBe(500);
      expect(result.memory).toBe(131072);
    });

    it('maps Running callback to done=false', () => {
      const result = service.mapCallback({
        jobId: 'j2',
        correlationId: '11',
        status: BotzoneJobStatus.Running,
      });
      expect(result.done).toBe(false);
    });

    it('maps WrongAnswer to done=true, status=WA', () => {
      const result = service.mapCallback({
        jobId: 'j3',
        correlationId: '12',
        status: BotzoneJobStatus.WrongAnswer,
      });
      expect(result.done).toBe(true);
      expect(result.status).toBe(Status.WA);
    });

    it('includes judgeResult when present', () => {
      const jr = JSON.stringify([{ kind: 'Accepted' }]);
      const result = service.mapCallback({
        jobId: 'j4',
        correlationId: '13',
        status: BotzoneJobStatus.Accepted,
        judgeResult: jr,
      });
      expect(result.judgeResult).toBe(jr);
    });
  });
});
