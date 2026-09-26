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
import { EventEmitter } from 'events';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    return def;
  }),
};

const mockCompeteService = {
  assertMatchGamerOwner: jest.fn(),
  findGamerByApiKey: jest.fn(),
  isMatchParticipant: jest.fn(),
  findOneMatch: jest.fn(),
};
const mockHumanTurnService = {
  notifyGameOver: jest.fn(),
  waitForResponse: jest.fn().mockResolvedValue('ok'),
  waitForTurn: jest.fn(),
  submitResponse: jest.fn(),
  registerSSEClient: jest.fn(),
  unregisterSSEClient: jest.fn(),
  replayPendingTurn: jest.fn(),
};

// Minimal providers needed to instantiate CompeteService (not actually called)
const mockRepo = { findOne: jest.fn(), update: jest.fn(), findBy: jest.fn() };
const mockQueue = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompeteController — bot authorization', () => {
  let controller: CompeteController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCompeteService.assertMatchGamerOwner.mockResolvedValue(42);
    mockCompeteService.isMatchParticipant.mockResolvedValue(true);
    mockCompeteService.findOneMatch.mockResolvedValue({ status: 1 });
    mockHumanTurnService.submitResponse.mockResolvedValue(false);
    mockHumanTurnService.replayPendingTurn.mockResolvedValue(undefined);
    mockHumanTurnService.registerSSEClient.mockReturnValue('connection');

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
        { provide: HumanTurnService, useValue: mockHumanTurnService },
        {
          provide: JwtAccessStrategy,
          useValue: { validate: jest.fn((value) => Promise.resolve(value)) },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        {
          provide: AutoMatchSchedulerService,
          useValue: { getStatus: jest.fn(), resetState: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<CompeteController>(CompeteController);
  });

  describe('human response and SSE authorization', () => {
    it('rejects invalid Bot keys and JWT before forwarding a response', async () => {
      mockCompeteService.findGamerByApiKey.mockResolvedValue(null);
      await expect(
        controller.botRespond({ turnToken: 't', response: 'x' }, 'bad-key'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        controller.botRespond(
          { turnToken: 't', response: 'x' },
          undefined,
          'Bearer bad',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockHumanTurnService.submitResponse).not.toHaveBeenCalled();
    });

    it('awaits shared authorization and does not claim success on a stale token', async () => {
      mockCompeteService.findGamerByApiKey.mockResolvedValue({ id: 31 });
      expect(
        await controller.botRespond({ turnToken: 't', response: 'x' }, 'key'),
      ).toEqual({ success: false, message: '找不到对应的 turn，可能已超时' });
      expect(mockHumanTurnService.submitResponse).toHaveBeenCalledWith(
        't',
        'x',
        undefined,
        31,
      );
    });

    it('rejects non-participants and replays terminal matches without an SSE timer', async () => {
      const response = () => {
        const res = new EventEmitter() as any;
        res.status = jest.fn(() => res);
        res.json = jest.fn();
        res.setHeader = jest.fn();
        res.flushHeaders = jest.fn();
        res.write = jest.fn();
        res.end = jest.fn();
        return res;
      };
      mockCompeteService.isMatchParticipant.mockResolvedValueOnce(false);
      const denied = response();
      await controller.humanSse(8, undefined, { sub: 11 } as any, denied);
      expect(denied.status).toHaveBeenCalledWith(403);
      expect(mockHumanTurnService.registerSSEClient).not.toHaveBeenCalled();

      mockCompeteService.findOneMatch.mockResolvedValue({
        status: 2,
        result: JSON.stringify({ finalResult: { '31': 1 } }),
      });
      const terminal = response();
      await controller.humanSse(8, undefined, { sub: 11 } as any, terminal);
      expect(terminal.write).toHaveBeenCalledWith(
        'data: {"type":"game-over","finalResult":{"31":1}}\n\n',
      );
      expect(terminal.end).toHaveBeenCalled();
      expect(mockHumanTurnService.registerSSEClient).not.toHaveBeenCalled();
    });
  });

});
