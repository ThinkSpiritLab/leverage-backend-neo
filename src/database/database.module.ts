import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { College } from './entities/college.entity'
import { Contest } from './entities/contest.entity'
import { ContestProblem } from './entities/contest-problem.entity'
import { ContestUser } from './entities/contest-user.entity'
import { ContestUserProblem } from './entities/contest-user-problem.entity'
import { Course } from './entities/course.entity'
import { CourseProblem } from './entities/course-problem.entity'
import { CourseUser } from './entities/course-user.entity'
import { Game } from './entities/game.entity'
import { Gamer } from './entities/gamer.entity'
import { Log } from './entities/log.entity'
import { Match } from './entities/match.entity'
import { MatchGamerLink } from './entities/match-gamer-link.entity'
import { Media } from './entities/media.entity'
import { Message } from './entities/message.entity'
import { Notification } from './entities/notification.entity'
import { Problem } from './entities/problem.entity'
import { Profession } from './entities/profession.entity'
import { RejudgeLog } from './entities/rejudge-log.entity'
import { Setting } from './entities/setting.entity'
import { Submission } from './entities/submission.entity'
import { SubmissionMisc } from './entities/submission-misc.entity'
import { Suspicion } from './entities/suspicion.entity'
import { Tag } from './entities/tag.entity'
import { User } from './entities/user.entity'
import { UserMeta } from './entities/user-meta.entity'

const entities = [
  College,
  Profession,
  User,
  UserMeta,
  Problem,
  Submission,
  SubmissionMisc,
  Suspicion,
  RejudgeLog,
  Contest,
  ContestUser,
  ContestProblem,
  ContestUserProblem,
  Course,
  CourseUser,
  CourseProblem,
  Tag,
  Log,
  Message,
  Notification,
  Media,
  Setting,
  Game,
  Gamer,
  Match,
  MatchGamerLink,
]

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        driver: require('mysql2'),
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        database: config.get<string>('database.database'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        entities,
        synchronize: process.env.NODE_ENV !== 'production',
        migrations: process.env.NODE_ENV === 'production' ? ['dist/migrations/*.js'] : [],
        migrationsRun: process.env.NODE_ENV === 'production',
        migrationsTableName: 'migrations',
        logging: process.env.NODE_ENV === 'development',
        charset: 'utf8mb4',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
