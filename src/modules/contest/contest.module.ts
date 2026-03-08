import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contest } from '../../database/entities/contest.entity';
import { ContestProblem } from '../../database/entities/contest-problem.entity';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity';
import { User } from '../../database/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { SubmissionModule } from '../submission/submission.module';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contest,
      ContestProblem,
      ContestUser,
      ContestUserProblem,
      User,
    ]),
    // Note: Submission is accessed via DataSource raw query to avoid circular imports
    AuthModule,
    SubmissionModule,
  ],
  controllers: [ContestController],
  providers: [ContestService],
  exports: [ContestService],
})
export class ContestModule {}
