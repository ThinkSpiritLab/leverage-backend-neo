import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import mysql2 from 'mysql2';
import { join } from 'node:path';
import { BackendRole, getBackendRole } from '../runtime/backend-role';

import { College } from './entities/college.entity';
import { Contest } from './entities/contest.entity';
import { ContestProblem } from './entities/contest-problem.entity';
import { ContestUser } from './entities/contest-user.entity';
import { ContestUserProblem } from './entities/contest-user-problem.entity';
import { Course } from './entities/course.entity';
import { CourseProblem } from './entities/course-problem.entity';
import { CourseUser } from './entities/course-user.entity';
import { Game } from './entities/game.entity';
import { Gamer } from './entities/gamer.entity';
import { Log } from './entities/log.entity';
import { Match } from './entities/match.entity';
import { MatchGamerLink } from './entities/match-gamer-link.entity';
import { Media } from './entities/media.entity';
import { Message } from './entities/message.entity';
import { Notification } from './entities/notification.entity';
import { Problem } from './entities/problem.entity';
import { Profession } from './entities/profession.entity';
import { RejudgeLog } from './entities/rejudge-log.entity';
import { Setting } from './entities/setting.entity';
import { Submission } from './entities/submission.entity';
import { SubmissionMisc } from './entities/submission-misc.entity';
import { Suspicion } from './entities/suspicion.entity';
import { Tag } from './entities/tag.entity';
import { User } from './entities/user.entity';
import { UserApiKey } from './entities/user-api-key.entity';
import { UserMeta } from './entities/user-meta.entity';

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
  UserApiKey,
];

export function createDatabaseOptions(
  config: ConfigService,
  role: BackendRole = getBackendRole(),
): TypeOrmModuleOptions {
  const production = process.env.NODE_ENV === 'production';
  return {
    type: 'mysql',
    driver: mysql2,
    host: config.get<string>('database.host'),
    port: config.get<number>('database.port'),
    database: config.get<string>('database.database'),
    username: config.get<string>('database.username'),
    password: config.get<string>('database.password'),
    entities,
    synchronize: role !== 'worker' && !production,
    // Only the single-instance HTTP startup path may perform legacy automatic migrations.
    // Resolve against the emitted module location (dist/src/database in this repository).
    migrations:
      role !== 'worker' && production
        ? [join(__dirname, '../migrations/*.js')]
        : [],
    migrationsRun: role !== 'worker' && production,
    migrationsTableName: 'migrations',
    // SQL parameters may contain submitted code, webhook secrets and test data.
    logging: production ? ['error'] : ['error', 'warn'],
    charset: 'utf8mb4',
    // 全局查询超时（慢查询记录警告，防止慢查询卡住连接池）
    maxQueryExecutionTime: parseInt(process.env.DB_QUERY_TIMEOUT || '10000'),
    // 连接池配置
    extra: {
      // 最大连接数（生产 20-50，开发 5-10）
      connectionLimit: parseInt(process.env.DB_POOL_SIZE || '20'),
      // Pool acquisition has no mysql2 acquireTimeout option; connectTimeout
      // only bounds opening a TCP connection, not waiting for a free pool slot.
      connectTimeout: 10000,
      // mysql2's pool option is idleTimeout (milliseconds).
      idleTimeout: 600000,
      // 心跳查询保持连接
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    },
  };
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createDatabaseOptions,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
