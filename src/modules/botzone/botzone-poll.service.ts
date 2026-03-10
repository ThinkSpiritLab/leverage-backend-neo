import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../../database/entities/submission.entity';
import { Status } from '../heng/heng.types';
import { JudgeProviderName } from '../judge-provider/judge-provider.interface';
import { BotzoneClientService } from './botzone-client.service';
import { BotzoneResultService } from './botzone-result.service';

/**
 * BotzonePollService
 *
 * Fallback polling for botzone submissions that have not received a callback.
 * Runs every BOTZONE_POLL_INTERVAL_MS milliseconds (default: 30_000).
 *
 * Picks up all submissions where:
 *   - provider = 'botzone'
 *   - status is still PENDING / JUDGING / COMPILING
 *   - externalJobId is not null
 *
 * For each one, calls BotzoneClientService.poll() and finalizes if done.
 */
@Injectable()
export class BotzonePollService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BotzonePollService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  // Guard to prevent concurrent poll runs
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    private readonly botzoneClient: BotzoneClientService,
    private readonly botzoneResultService: BotzoneResultService,
  ) {
    this.intervalMs = this.configService.get<number>(
      'botzone.pollIntervalMs',
      30_000,
    );
  }

  onModuleInit(): void {
    const enabled = this.configService.get<boolean>('botzone.enabled', false);
    if (!enabled) {
      this.logger.log('BotzonePollService: botzone disabled, skipping poll loop');
      return;
    }
    this.logger.log(
      `BotzonePollService: starting poll loop every ${this.intervalMs}ms`,
    );
    this.intervalHandle = setInterval(() => this.doPoll(), this.intervalMs);
  }

  onApplicationShutdown(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('BotzonePollService: poll loop stopped');
    }
  }

  /**
   * Run one poll cycle.
   * Public for testing; called automatically by the interval timer.
   */
  async doPoll(): Promise<void> {
    if (this.running) {
      this.logger.debug('BotzonePollService: skipping poll (previous run still active)');
      return;
    }
    this.running = true;
    try {
      await this.pollPendingSubmissions();
    } catch (err) {
      this.logger.error('BotzonePollService: poll cycle error', err);
    } finally {
      this.running = false;
    }
  }

  private async pollPendingSubmissions(): Promise<void> {
    const pendingStatuses = [Status.PENDING, Status.JUDGING, Status.COMPILING];

    const submissions = await this.submissionRepo
      .createQueryBuilder('s')
      .where('s.provider = :provider', { provider: JudgeProviderName.Botzone })
      .andWhere('s.status IN (:...statuses)', { statuses: pendingStatuses })
      .andWhere('s.externalJobId IS NOT NULL')
      // Only poll submissions that have been pending for at least 10s
      .andWhere(
        's.updatedAt < :cutoff',
        { cutoff: new Date(Date.now() - 10_000) },
      )
      .select(['s.id', 's.externalJobId', 's.status'])
      .limit(50)
      .getMany();

    if (submissions.length === 0) return;

    this.logger.log(
      `BotzonePollService: polling ${submissions.length} pending botzone submission(s)`,
    );

    for (const sub of submissions) {
      try {
        const pollResult = await this.botzoneClient.poll(
          sub.id,
          sub.externalJobId!,
        );
        if (pollResult.done) {
          await this.botzoneResultService.finalize(sub.id, pollResult);
          this.logger.log(
            `BotzonePollService: finalized submissionId=${sub.id} via polling, status=${pollResult.status}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `BotzonePollService: failed to poll submissionId=${sub.id}: ${err}`,
        );
      }
    }
  }
}
