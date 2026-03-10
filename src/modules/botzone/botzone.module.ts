import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { RedisModule } from '../redis/redis.module';
import { RankModule } from '../rank/rank.module';
import { BotzoneClientService } from './botzone-client.service';
import { BotzoneCallbackController } from './botzone-callback.controller';
import { BotzoneResultService } from './botzone-result.service';
import { BotzonePollService } from './botzone-poll.service';

/**
 * BotzoneModule
 *
 * Integrates leverage-backend-neo with the botzone-neo external judge.
 *
 * Provides:
 *   - BotzoneClientService  — HTTP adapter (IJudgeProvider implementation)
 *   - BotzoneCallbackController — POST /botzone/callback (token-authenticated)
 *   - BotzoneResultService  — DB finalisation logic (idempotent)
 *   - BotzonePollService    — Fallback polling for missed callbacks
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, SubmissionMisc]),
    RedisModule,
    RankModule,
  ],
  controllers: [BotzoneCallbackController],
  providers: [
    BotzoneClientService,
    BotzoneResultService,
    BotzonePollService,
  ],
  exports: [BotzoneClientService],
})
export class BotzoneModule {}
