import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { Problem } from '../../database/entities/problem.entity'
import { Tag } from '../../database/entities/tag.entity'
import { ContestProblem } from '../../database/entities/contest-problem.entity'
import { CourseProblem } from '../../database/entities/course-problem.entity'
import { Submission } from '../../database/entities/submission.entity'
import { AuthModule } from '../auth/auth.module'
import { ProblemController } from './problem.controller'
import { ProblemService } from './problem.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Problem, Tag, ContestProblem, CourseProblem, Submission]),
    MulterModule.register({ dest: '/tmp/uploads' }),
    AuthModule,
  ],
  controllers: [ProblemController],
  providers: [ProblemService],
  exports: [ProblemService],
})
export class ProblemModule {}
