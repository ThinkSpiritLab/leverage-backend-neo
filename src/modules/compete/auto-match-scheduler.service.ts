import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { runsHttp } from '../../runtime/backend-role';
import { LeaseService } from '../redis/lease.service';
import { RedisService } from '../redis/redis.service';
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
const LEASE_TTL_MS = 120_000;
const LEASE_RENEW_MS = 30_000;
const stateKey = (gameId: number) => `auto-match:schedule:${gameId}`;
const leaseKey = (gameId: number) => `auto-match:lease:${gameId}`;

@Injectable()
export class AutoMatchSchedulerService {
  private readonly logger = new Logger(AutoMatchSchedulerService.name);
  constructor(
    @InjectRepository(Game) private readonly gameRepo: Repository<Game>,
    @InjectRepository(Gamer) private readonly gamerRepo: Repository<Gamer>,
    private readonly competeService: CompeteService,
    private readonly lease: LeaseService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (!runsHttp()) return;
    const games = await this.gameRepo.find({
      where: { autoMatchEnabled: true, disabled: false },
    });

    for (const game of games) {
      const key = leaseKey(game.id);
      let token: string | null = null;
      let renewal: ReturnType<typeof setInterval> | undefined;
      let lost = false;
      let state: GameScheduleState | undefined;
      try {
        token = await this.lease.acquire(key, LEASE_TTL_MS);
        if (!token) continue;
        const owner = token;
        renewal = setInterval(() => {
          void this.lease
            .renew(key, owner, LEASE_TTL_MS)
            .then((ok) => {
              if (!ok) lost = true;
            })
            .catch((error: Error) => {
              lost = true;
              this.logger.warn(
                `AutoMatch game#${game.id} lease renewal failed: ${error.message}`,
              );
            });
        }, LEASE_RENEW_MS);
        renewal.unref();
        const raw = await this.redis.get(stateKey(game.id));
        const now = Date.now();
        state = raw
          ? (JSON.parse(raw) as GameScheduleState)
          : {
              lastElos: {},
              intervalMs: MIN_INTERVAL_MS,
              nextRunAt: now,
              consecutiveStable: 0,
            };
        if (now < state.nextRunAt || lost) continue;
        // Snapshot current ELOs
        const gamers = await this.gamerRepo.find({
          where: { gameId: game.id, type: 'code' as any, disabled: false },
          order: { elo: 'DESC' },
          take: TOP_N,
        });
        const currentElos: Record<number, number> = {};
        for (const g of gamers) currentElos[g.id] = g.elo;

        // Check ownership before starting the non-cancellable database operation.
        if (lost || !(await this.lease.renew(key, owner, LEASE_TTL_MS)))
          continue;
        const { created } = await this.competeService.triggerAutoMatch(
          game.id,
          TOP_N,
        );
        this.logger.log(
          `AutoMatch game#${game.id}: created ${created} matches`,
        );

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
            state.intervalMs = Math.min(MAX_INTERVAL_MS, state.intervalMs * 2);
          }
        } else {
          state.consecutiveStable = 0;
        }

        state.nextRunAt = now + state.intervalMs;
        // Atomically publish cadence only if this instance still owns the lease.
        if (
          !lost &&
          (await this.lease.setIfOwned(
            key,
            owner,
            stateKey(game.id),
            JSON.stringify(state),
          ))
        ) {
          this.logger.log(
            `AutoMatch game#${game.id}: avgDelta=${avgDelta.toFixed(1)}, next in ${state.intervalMs / 1000}s`,
          );
        } else {
          this.logger.warn(
            `AutoMatch game#${game.id} lost lease; cadence not published`,
          );
        }
      } catch (e: any) {
        this.logger.error(`AutoMatch game#${game.id} failed: ${e.message}`);
        if (state && token && !lost) {
          state.nextRunAt = Date.now() + MIN_INTERVAL_MS;
          try {
            await this.lease.setIfOwned(
              key,
              token,
              stateKey(game.id),
              JSON.stringify(state),
            );
          } catch (error: any) {
            this.logger.warn(
              `AutoMatch game#${game.id} could not record retry: ${error.message}`,
            );
          }
        }
      } finally {
        if (renewal) clearInterval(renewal);
        if (token) {
          try {
            await this.lease.release(key, token);
          } catch (error: any) {
            this.logger.warn(
              `AutoMatch game#${game.id} lease release failed: ${error.message}`,
            );
          }
        }
      }
    }
  }

  /** Manual trigger — reset interval to minimum */
  async resetState(gameId: number) {
    await this.redis.del(stateKey(gameId));
  }

  /** Return current scheduler state for a game */
  async getStatus(gameId: number) {
    const game = await this.gameRepo.findOne({ where: { id: gameId } });
    const raw = await this.redis.get(stateKey(gameId));
    const state = raw ? (JSON.parse(raw) as GameScheduleState) : null;
    return {
      enabled: game?.autoMatchEnabled ?? false,
      intervalMs: state?.intervalMs ?? MIN_INTERVAL_MS,
      nextRunAt: state?.nextRunAt ?? null,
      consecutiveStable: state?.consecutiveStable ?? 0,
    };
  }
}
