import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { ScheduleModule } from '@nestjs/schedule';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';
import { MatchGamerLink } from '../../database/entities/match-gamer-link.entity';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { SettingModule } from '../setting/setting.module';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { CompeteController } from './compete.controller';
import { CompeteService } from './compete.service';
import { HumanTurnService } from './human-turn.service';
import { CompeteCleanupTask } from './compete-cleanup.task';
// CompeteTxWorker merged into JudgeTxWorker — do not register here

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Game, Gamer, Match, MatchGamerLink]),
    BullModule.registerQueue({ name: JUDGE_TX_QUEUE }),
    MulterModule.register({ dest: '/tmp/uploads' }),
    AuthModule,
    RedisModule,
    SettingModule,
  ],
  controllers: [CompeteController],
  providers: [CompeteService, HumanTurnService, CompeteCleanupTask],
  exports: [CompeteService, HumanTurnService],
})
export class CompeteModule {}
