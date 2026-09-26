import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessStrategy } from '../auth/strategies/jwt-access.strategy';
import { AutoMatchSchedulerService } from './auto-match-scheduler.service';
import { CompeteController } from './compete.controller';
import { CompeteService } from './compete.service';
import { HumanTurnService } from './human-turn.service';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';
import { MatchGamerLink } from '../../database/entities/match-gamer-link.entity';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { RedisService } from '../redis/redis.service';
import { SettingService } from '../setting/setting.service';
import { MatchCallbackDto } from './dto/match-callback.dto';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'botzone.callbackToken') return 'secret-token';
    return def;
  }),
};

const mockCompeteService = {
  handleMatchCallback: jest.fn(),
  assertMatchGamerOwner: jest.fn(),
};

// Minimal providers needed to instantiate CompeteService (not actually called)
const mockRepo = { findOne: jest.fn(), update: jest.fn(), findBy: jest.fn() };
const mockQueue = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCallback(overrides: Partial<MatchCallbackDto> = {}): MatchCallbackDto {
  return {
    jobId: 'bz-game-42',
    state: 'finished',
    type: 'botzone',
    result: {
      verdict: 'Accepted',
      rounds: [],
      finalResult: { '101': 5, '102': 3 },
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompeteController — match-callback', () => {
  let controller: CompeteController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCompeteService.handleMatchCallback.mockResolvedValue({ ok: true });
    mockCompeteService.assertMatchGamerOwner.mockResolvedValue(42);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompeteController],
      providers: [
        { provide: CompeteService, useValue: mockCompeteService },
        { provide: ConfigService, useValue: mockConfigService },
        // Satisfy CompeteService constructor (not actually instantiated here, but needed by NestJS DI)
        { provide: getRepositoryToken(Game), useValue: mockRepo },
        { provide: getRepositoryToken(Gamer), useValue: mockRepo },
        { provide: getRepositoryToken(Match), useValue: mockRepo },
        { provide: getRepositoryToken(MatchGamerLink), useValue: mockRepo },
        { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: mockQueue },
        { provide: DataSource, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: SettingService, useValue: {} },
        { provide: HumanTurnService, useValue: { notifyGameOver: jest.fn(), waitForResponse: jest.fn().mockResolvedValue('ok'), waitForTurn: jest.fn(), registerSSEClient: jest.fn(), unregisterSSEClient: jest.fn(), replayPendingTurn: jest.fn() } },
        { provide: JwtAccessStrategy, useValue: { validate: jest.fn(async value => value) } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: AutoMatchSchedulerService, useValue: { getStatus: jest.fn(), resetState: jest.fn() } },
      ],
    }).compile();

    controller = module.get<CompeteController>(CompeteController);
  });

  // ─── 认证 ─────────────────────────────────────────────────────────────

  describe('Bearer token 认证', () => {
    it('token 正确时：调用 handleMatchCallback 并返回 ok=true', async () => {
      const body = buildCallback();
      const result = await controller.receiveMatchCallbackLegacy(
        'Bearer secret-token',
        body,
      );

      expect(mockCompeteService.handleMatchCallback).toHaveBeenCalledWith(
        body.jobId,
        body.state,
        body.result,
      );
      expect(result).toEqual({ ok: true });
    });

    it('token 错误时：抛出 UnauthorizedException', async () => {
      await expect(
        controller.receiveMatchCallbackLegacy('Bearer wrong-token', buildCallback()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockCompeteService.handleMatchCallback).not.toHaveBeenCalled();
    });

    it('未配置回调 token 时 fail closed', async () => {
      (controller as any).callbackToken = '';
      await expect(controller.receiveMatchCallbackLegacy(undefined, buildCallback()))
        .rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockCompeteService.handleMatchCallback).not.toHaveBeenCalled();
    });

    it('无 Authorization 头时：抛出 UnauthorizedException', async () => {
      await expect(
        controller.receiveMatchCallbackLegacy(undefined, buildCallback()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('human-turn-webhook', () => {
    it('requires the callback token and verifies the match/gamer link before waiting', async () => {
      await expect(controller.humanTurnWebhook(8, 31, {}, undefined, undefined))
        .rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockCompeteService.assertMatchGamerOwner).not.toHaveBeenCalled();

      await expect(controller.humanTurnWebhook(8, 31, {}, undefined, 'secret-token')).resolves.toBe('ok');
      expect(mockCompeteService.assertMatchGamerOwner).toHaveBeenCalledWith(8, 31);
    });
  });

  // ─── 回调处理 ─────────────────────────────────────────────────────────

  describe('回调处理', () => {
    const authHeader = 'Bearer secret-token';

    it('terminal 状态 finished → 正常处理', async () => {
      const body = buildCallback({ state: 'finished' });
      const result = await controller.receiveMatchCallbackLegacy(authHeader, body);
      expect(result).toEqual({ ok: true });
      expect(mockCompeteService.handleMatchCallback).toHaveBeenCalledTimes(1);
    });

    it('terminal 状态 failed → 正常处理', async () => {
      const body = buildCallback({ state: 'failed', result: undefined });
      await controller.receiveMatchCallbackLegacy(authHeader, body);
      expect(mockCompeteService.handleMatchCallback).toHaveBeenCalledWith(
        body.jobId,
        'failed',
        undefined,
      );
    });

    it('中间状态 running → 也会转发给 service（service 内部处理幂等）', async () => {
      const body = buildCallback({ state: 'running', result: undefined });
      await controller.receiveMatchCallbackLegacy(authHeader, body);
      expect(mockCompeteService.handleMatchCallback).toHaveBeenCalledTimes(1);
    });

    it('service 返回 ok=false → controller 透传', async () => {
      mockCompeteService.handleMatchCallback.mockResolvedValue({ ok: false });
      const body = buildCallback({ jobId: 'unknown-job' });
      const result = await controller.receiveMatchCallbackLegacy(authHeader, body);
      expect(result).toEqual({ ok: false });
    });
  });
});
