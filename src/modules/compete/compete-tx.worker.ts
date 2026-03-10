import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { Match } from '../../database/entities/match.entity';
import { MatchStatus } from './compete.service';

// ─── Job payload (set by CompeteService.launchMatch) ─────────────────────────

export interface CompeteTxPayload {
  matchId: number;
  game: {
    judgerCode: string;
    /** Language string (e.g. 'cpp17') or botzone language identifier */
    judgerLanguage: string;
    timeLimit: number;
    memoryLimit: number;
  };
  /** Array indexed by position (position 0 = gamers[0]) */
  gamers: Array<{
    id: number;
    code: string;
    language: string;
    position?: number;
    type?: 'code' | 'webhook' | 'human';
    webhookUrl?: string;
    webhookSecret?: string;
  }>;
  /** position index → real gamerId mapping */
  positionToGamerId?: Record<number, number>;
}

/** Shape of the botzone-neo game-submit request body */
interface BotzoneGameSubmitRequest {
  type: 'botzone';
  judger: {
    sourceCode: string; // base64
    language: string;
  };
  bots: Array<{
    position: number;
    botId: string;
    sourceCode: string; // base64
    language: string;
  }>;
  timeLimit: number;
  memoryLimitMB: number;
  callbackUrl: string;
  correlationId: string;
}

interface BotzoneGameSubmitResponse {
  jobId: string;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

/**
 * CompeteTxWorker
 *
 * Processes 'compete' jobs from the JUDGE_TX_QUEUE.
 * Builds a botzone game-type task from the job payload and submits it
 * to botzone-neo POST /v1/judge.
 *
 * On success:
 *   - Stores externalJobId on the Match entity
 *   - Updates match.status → RUNNING
 *
 * On failure:
 *   - Updates match.status → ERROR
 *   - Re-throws so Bull can retry
 */
@Injectable()
@Processor(JUDGE_TX_QUEUE)
export class CompeteTxWorker {
  private readonly logger = new Logger(CompeteTxWorker.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    private readonly configService: ConfigService,
  ) {}

  @Process('compete')
  async handle(job: Job<CompeteTxPayload>): Promise<void> {
    const { matchId, game, gamers } = job.data;

    this.logger.log(
      `Processing compete job: matchId=${matchId}, gamers=${gamers.length}`,
    );

    const baseUrl = this.configService.get<string>('botzone.baseUrl', '');
    const apiKey = this.configService.get<string>('botzone.apiKey', '');
    const callbackBase = this.configService.get<string>(
      'baseUrl',
      'http://localhost:3000',
    );

    const callbackUrl = `${callbackBase}/compete/match-callback`;
    const correlationId = `match-${matchId}`;

    // Build botzone game-type request
    const body: BotzoneGameSubmitRequest = {
      type: 'botzone',
      judger: {
        sourceCode: Buffer.from(game.judgerCode, 'utf-8').toString('base64'),
        language: game.judgerLanguage,
      },
      bots: gamers.map((gamer, index) => {
        const isWebhook = gamer.type === 'webhook' && gamer.webhookUrl;
        return {
          position: index,
          botId: String(gamer.id),
          sourceCode: isWebhook ? '' : Buffer.from(gamer.code ?? '', 'utf-8').toString('base64'),
          language: isWebhook ? 'webhook' : gamer.language,
          runnerType: isWebhook ? 'webhook' : 'code',
          externalUrl: isWebhook ? gamer.webhookUrl : undefined,
        };
      }),
      timeLimit: game.timeLimit,
      memoryLimitMB: Math.round(game.memoryLimit),
      callbackUrl,
      correlationId,
    };

    try {
      const res = await axios.post<BotzoneGameSubmitResponse>(
        `${baseUrl}/v1/judge`,
        body,
        {
          timeout: 10_000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      const { jobId } = res.data;
      this.logger.log(
        `Compete job accepted by botzone: matchId=${matchId}, jobId=${jobId}`,
      );

      // Persist external job ID and flip status to RUNNING
      await this.matchRepo.update(matchId, {
        externalJobId: jobId,
        status: MatchStatus.RUNNING,
      });
    } catch (err: unknown) {
      this.logger.error(
        `Failed to submit compete job to botzone: matchId=${matchId}`,
        err,
      );
      // Mark as ERROR so the match isn't stuck in PENDING forever
      await this.matchRepo.update(matchId, { status: MatchStatus.ERROR });
      throw err; // Let Bull retry
    }
  }
}
