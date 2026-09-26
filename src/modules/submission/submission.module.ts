import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { Problem } from '../../database/entities/problem.entity';
import { RejudgeLog } from '../../database/entities/rejudge-log.entity';
import { Suspicion } from '../../database/entities/suspicion.entity';
import { AuthModule } from '../auth/auth.module';
import { MetricsModule } from '../metrics/metrics.module';
import { QueueModule } from '../queue/queue.module';

import { ReceiveModule } from '../receive/receive.module';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Submission,
      SubmissionMisc,
      Problem,
      RejudgeLog,
      Suspicion,
    ]),
    AuthModule,
    MetricsModule,
    QueueModule,

    ReceiveModule,
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
