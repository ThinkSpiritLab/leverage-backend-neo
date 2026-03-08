import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Course } from '../../database/entities/course.entity'
import { CourseUser } from '../../database/entities/course-user.entity'
import { CourseProblem } from '../../database/entities/course-problem.entity'
import { Submission } from '../../database/entities/submission.entity'
import { User } from '../../database/entities/user.entity'
import { AuthModule } from '../auth/auth.module'
import { SubmissionModule } from '../submission/submission.module'
import { CourseController } from './course.controller'
import { CourseService } from './course.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, CourseUser, CourseProblem, Submission, User]),
    AuthModule,
    SubmissionModule,
  ],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
