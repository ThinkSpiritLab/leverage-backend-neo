import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../../database/entities/user.entity'
import { Problem } from '../../database/entities/problem.entity'
import { Submission } from '../../database/entities/submission.entity'
import { AuthModule } from '../auth/auth.module'
import { StatisticsController } from './statistics.controller'
import { StatisticsService } from './statistics.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Problem, Submission]),
    AuthModule,
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
