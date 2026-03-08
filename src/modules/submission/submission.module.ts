import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Submission } from '../../database/entities/submission.entity'
import { SubmissionMisc } from '../../database/entities/submission-misc.entity'
import { Problem } from '../../database/entities/problem.entity'
import { AuthModule } from '../auth/auth.module'
import { QueueModule } from '../queue/queue.module'
import { SubmissionController } from './submission.controller'
import { SubmissionService } from './submission.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, SubmissionMisc, Problem]),
    AuthModule,
    QueueModule,
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
