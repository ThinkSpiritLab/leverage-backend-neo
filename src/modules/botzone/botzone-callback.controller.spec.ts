import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { BotzoneCallbackController } from './botzone-callback.controller';
import { BotzoneClientService } from './botzone-client.service';
import { BotzoneResultService } from './botzone-result.service';
import { BotzoneJobStatus } from './botzone.types';
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

function buildBody(overrides: Partial<{
  jobId: string;
  correlationId: string;
  status: BotzoneJobStatus;
  time?: number;
  memory?: number;
}> = {}) {
  return {
    jobId: 'bz-job-42',
    correlationId: '42',
    status: BotzoneJobStatus.Accepted,
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
      const body = buildBody();
      await expect(
        controller.receiveCallback('Bearer secret-callback-token', body),
      ).resolves.toEqual({ ok: true });
    });

    it('rejects wrong token', async () => {
      const body = buildBody();
      await expect(
        controller.receiveCallback('Bearer wrong-token', body),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects missing token', async () => {
      const body = buildBody();
      await expect(
        controller.receiveCallback(undefined, body),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts token without Bearer prefix', async () => {
      const body = buildBody();
      await expect(
        controller.receiveCallback('secret-callback-token', body),
      ).resolves.toEqual({ ok: true });
    });

    it('allows through when no token configured (dev mode)', async () => {
      // Reconfigure: no callback token
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
      const body = buildBody();
      await expect(
        ctrl2.receiveCallback(undefined, body),
      ).resolves.toEqual({ ok: true });
    });
  });

  // ─── Terminal status handling ─────────────────────────────────────────────

  describe('terminal status → finalize', () => {
    const AUTH = 'Bearer secret-callback-token';

    it('calls finalize for Accepted', async () => {
      const body = buildBody({ status: BotzoneJobStatus.Accepted });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(42, expect.any(Object));
    });

    it('calls finalize for WrongAnswer', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({ done: true, status: Status.WA });
      const body = buildBody({ status: BotzoneJobStatus.WrongAnswer });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ done: true, status: Status.WA }),
      );
    });

    it('calls finalize for CompileError', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({
        done: true,
        status: Status.CE,
        compileErrorMsg: 'error: x',
      });
      const body = buildBody({
        status: BotzoneJobStatus.CompileError,
        correlationId: '77',
      });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledWith(77, expect.any(Object));
    });

    it('calls finalize for SystemError', async () => {
      mockBotzoneClient.mapCallback.mockReturnValue({ done: true, status: Status.SE });
      const body = buildBody({ status: BotzoneJobStatus.SystemError });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Intermediate status handling ─────────────────────────────────────────

  describe('intermediate status → no finalize', () => {
    const AUTH = 'Bearer secret-callback-token';

    it('does NOT call finalize for Pending', async () => {
      const body = buildBody({ status: BotzoneJobStatus.Pending });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });

    it('does NOT call finalize for Running', async () => {
      const body = buildBody({ status: BotzoneJobStatus.Running });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });

    it('does NOT call finalize for Compiling', async () => {
      const body = buildBody({ status: BotzoneJobStatus.Compiling });
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });
  });

  // ─── Invalid correlationId ────────────────────────────────────────────────

  describe('invalid correlationId', () => {
    const AUTH = 'Bearer secret-callback-token';

    it('returns ok=false for non-numeric correlationId', async () => {
      const body = buildBody({ correlationId: 'not-a-number' });
      const result = await controller.receiveCallback(AUTH, body);
      expect(result).toEqual({ ok: false });
      expect(mockBotzoneResultService.finalize).not.toHaveBeenCalled();
    });
  });

  // ─── Idempotency (delegate to BotzoneResultService) ──────────────────────

  describe('idempotency', () => {
    it('can call finalize twice without error (service is idempotent)', async () => {
      const AUTH = 'Bearer secret-callback-token';
      const body = buildBody();
      await controller.receiveCallback(AUTH, body);
      await controller.receiveCallback(AUTH, body);
      expect(mockBotzoneResultService.finalize).toHaveBeenCalledTimes(2);
    });
  });
});
