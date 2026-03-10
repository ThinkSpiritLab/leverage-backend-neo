import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { BotzoneCallbackController } from './botzone-callback.controller';
import { BotzoneClientService } from './botzone-client.service';
import { BotzoneResultService } from './botzone-result.service';
import type { BotzoneCallbackBody } from './botzone.types';
import { Status } from '../heng/heng.types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'botzone.callbackToken') return 'secret-callback-token';
    return def;
  }),
};

const mockBotzoneClient = {
  mapCallback: jest.fn(),
};

const mockBotzoneResultService = {
  finalize: jest.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOJBody(overrides: Partial<BotzoneCallbackBody> = {}): BotzoneCallbackBody {
  return {
    jobId: 'bz-job-42',
    correlationId: '42',
    state: 'finished',
    type: 'oj',
    result: {
      verdict: 'Accepted',
      testcases: [{ id: 1, verdict: 'Accepted', timeMs: 100, memoryKb: 2048 }],
    },
    ...overrides,
  };
}

function buildGameBody(overrides: Partial<BotzoneCallbackBody> = {}): BotzoneCallbackBody {
  return {
    jobId: 'bz-game-10',
    correlationId: '10',
    state: 'finished',
    type: 'botzone',
    result: {
      verdict: 'Accepted',
      rounds: [{ r: 1 }],
      finalResult: { bot1: 5, bot2: 3 },
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BotzoneCallbackController', () => {
  let controller: BotzoneCallbackController;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: mapCallback returns AC done=true
    mockBotzoneClient.mapCallback.mockReturnValue({
      done: true,
      status: Status.AC,
      time: 100,
      memory: 65536,
    });
    mockBotzoneResultService.finalize.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BotzoneCallbackController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: BotzoneClientService, useValue: mockBotzoneClient },
        { provide: BotzoneResultService, useValue: mockBotzoneResultService },
      ],
    }).compile();

    controller = module.get<BotzoneCallbackController>(
      BotzoneCallbackController,
    );
  });

  // ─── Auth ────────────────────────────────────────────────────────────────

  describe('token authentication', () => {
    it('accepts correct Bearer token', async () => {
      const body = buildOJBody();
      await expect(
        controller.receiveCallback('Bearer secret-callback-token', body),
      ).resolves.toEqual({ ok: true });
    });

    it('rejects wrong token', async () => {
      const body = buildOJBody();
      await expect(
        controller.receiveCallback('Bearer wrong-token', body),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects missing token', async () => {
      const body = buildOJBody();
      await expect(
        controller.receiveCallback(undefined, body),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts token without Bearer prefix', async () => {
      const body = buildOJBody();
      await expect(
        controller.receiveCallback('secret-callback-token', body),
      ).resolves.toEqual({ ok: true });
    });

    it('allows through when no token configured (dev mode)', async () => {
      const noTokenConfig = {
        get: jest.fn((key: string, def?: unknown) => {
          if (key === 'botzone.callbackToken') return '';
          return def;
        }),
      };
      const module2: TestingModule = await Test.createTestingModule({
        controllers: [BotzoneCallbackController],
        providers: [
          { provide: ConfigService, useValue: noTokenConfig },
          { provide: BotzoneClientService, useValue: mockBotzoneClient },
          { provide: BotzoneResultService, useValue: mockBotzoneResultService },
        ],
      }).compile();

      const ctrl2 = module2.get<BotzoneCallbackController>(
        BotzoneCallbackController,
      );
      const body = buildOJBody();
      await expect(
        ctrl2.receiveCallback(undefined, body),
      ).resolves.toEqual({ ok: true });
    });
  });

  // ─── Terminal state → finalize ────────────────────────────────────────────

  describe('terminal state → finalize', () => {
    const AUTH = 'Bearer secret-callback-token';

    it('calls finalize for finished/Accepted OJ result', async () => {
      const body = buildOJBody();
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(42, expect.any(Object));
    });

    it('calls finalize for finished/WrongAnswer', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({ done: true, status: Status.WA });
      const body = buildOJBody({
        result: {
          verdict: 'WrongAnswer',
          testcases: [{ id: 1, verdict: 'WrongAnswer', timeMs: 10, memoryKb: 256 }],
        },
      });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ done: true, status: Status.WA }),
      );
    });

    it('calls finalize for finished/CompileError with CE status', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({
        done: true,
        status: Status.CE,
        compileErrorMsg: 'error: x',
      });
      const body = buildOJBody({
        correlationId: '77',
        result: {
          verdict: 'CompileError',
          testcases: [],
          compile: { verdict: 'Error', message: 'error: x' },
        },
      });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(77, expect.any(Object));
    });

    it('calls finalize for failed state (SE)', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({ done: true, status: Status.SE });
      const body = buildOJBody({ state: 'failed', result: undefined });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledTimes(1);
    });

    it('calls finalize for finished botzone game result', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({
        done: true,
        status: Status.AC,
        judgeResult: JSON.stringify({ verdict: 'Accepted', finalResult: { bot1: 5 } }),
        providerMeta: { gameLog: { rounds: [], finalResult: { bot1: 5 } } },
      });
      const body = buildGameBody();
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ done: true, status: Status.AC }),
      );
    });
  });

  // ─── Intermediate state → no finalize ────────────────────────────────────

  describe('intermediate state → no finalize', () => {
    const AUTH = 'Bearer secret-callback-token';

    it('does NOT call finalize for pending state', async () => {
      const body = buildOJBody({ state: 'pending', result: undefined });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });

    it('does NOT call finalize for running state', async () => {
      const body = buildOJBody({ state: 'running', result: undefined });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });

    it('does NOT call finalize for compiling state', async () => {
      const body = buildOJBody({ state: 'compiling', result: undefined });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });

    it('does NOT call finalize for queued state', async () => {
      const body = buildOJBody({ state: 'queued', result: undefined });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });
  });

  // ─── Invalid correlationId ────────────────────────────────────────────────

  describe('invalid correlationId', () => {
    const AUTH = 'Bearer secret-callback-token';

    it('returns ok=false for non-numeric correlationId', async () => {
      const body = buildOJBody({ correlationId: 'not-a-number' });
      const result = await controller.receiveCallback(AUTH, body);
      expect(result).toEqual({ ok: false });
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });
  });

  // ─── Idempotency (delegate to BotzoneResultService) ──────────────────────

  describe('idempotency', () => {
    it('can call finalize twice without error (service is idempotent)', async () => {
      const AUTH = 'Bearer secret-callback-token';
      const body = buildOJBody();
      await controller.receiveCallback(AUTH, body);
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledTimes(2);
    });
  });
});
