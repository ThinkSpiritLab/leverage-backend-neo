import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { CompeteService } from './compete.service';

interface GameScheduleState {
  lastElos: Record<number, number>; // gamerId → elo
  intervalMs: number; // current interval
  nextRunAt: number; // timestamp
  consecutiveStable: number;
}

const MIN_INTERVAL_MS = 60_000; // 1 min
const MAX_INTERVAL_MS = 30 * 60_000; // 30 min
const TOP_N = 8;

@Injectable()
export class AutoMatchSchedulerService {
  private readonly logger = new Logger(AutoMatchSchedulerService.name);
  private readonly states = new Map<number, GameScheduleState>();

  constructor(
    @InjectRepository(Game) private readonly gameRepo: Repository<Game>,
    @InjectRepository(Gamer) private readonly gamerRepo: Repository<Gamer>,
    private readonly competeService: CompeteService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    const now = Date.now();
    const games = await this.gameRepo.find({
      where: { autoMatchEnabled: true, disabled: false },
    });

    for (const game of games) {
      let state = this.states.get(game.id);
      if (!state) {
        state = {
          lastElos: {},
          intervalMs: MIN_INTERVAL_MS,
          nextRunAt: now,
          consecutiveStable: 0,
        };
        this.states.set(game.id, state);
      }
      if (now < state.nextRunAt) continue;

      try {
        // Snapshot current ELOs
        const gamers = await this.gamerRepo.find({
          where: { gameId: game.id, type: 'code' as any, disabled: false },
          order: { elo: 'DESC' },
          take: TOP_N,
        });
        const currentElos: Record<number, number> = {};
        for (const g of gamers) currentElos[g.id] = g.elo;

        // Run auto-match
        const { created } = await this.competeService.triggerAutoMatch(
          game.id,
          TOP_N,
        );
        this.logger.log(`AutoMatch game#${game.id}: created ${created} matches`);

        // Compare ELOs (next tick will capture post-match ELOs)
        const prevElos = state.lastElos;
        let totalDelta = 0;
        for (const [id, elo] of Object.entries(currentElos)) {
          const prev = prevElos[Number(id)];
          if (prev !== undefined) totalDelta += Math.abs(elo - prev);
        }
        const avgDelta =
          Object.keys(currentElos).length > 0
            ? totalDelta / Object.keys(currentElos).length
            : 0;

        state.lastElos = currentElos;

        // Adaptive backoff
        if (avgDelta > 20) {
          // Big changes — run more often
          state.intervalMs = Math.max(MIN_INTERVAL_MS, state.intervalMs / 2);
          state.consecutiveStable = 0;
        } else if (avgDelta < 5) {
          // Stable — back off
          state.consecutiveStable++;
          if (state.consecutiveStable >= 3) {
            state.intervalMs = Math.min(
              MAX_INTERVAL_MS,
              state.intervalMs * 2,
            );
          }
        } else {
          state.consecutiveStable = 0;
        }

        state.nextRunAt = now + state.intervalMs;
        this.logger.log(
          `AutoMatch game#${game.id}: avgDelta=${avgDelta.toFixed(1)}, next in ${state.intervalMs / 1000}s`,
        );
      } catch (e: any) {
        this.logger.error(
          `AutoMatch game#${game.id} failed: ${e.message}`,
        );
        state.nextRunAt = now + MIN_INTERVAL_MS;
      }
    }
  }

  /** Manual trigger — reset interval to minimum */
  resetState(gameId: number) {
    this.states.delete(gameId);
  }

  /** Return current scheduler state for a game */
  async getStatus(gameId: number) {
    const game = await this.gameRepo.findOne({ where: { id: gameId } });
    const state = this.states.get(gameId);
    return {
      enabled: game?.autoMatchEnabled ?? false,
      intervalMs: state?.intervalMs ?? MIN_INTERVAL_MS,
      nextRunAt: state?.nextRunAt ?? null,
      consecutiveStable: state?.consecutiveStable ?? 0,
    };
  }
}
