import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from './config/configuration'
import { validationSchema } from './config/validation.schema'
import { DatabaseModule } from './database/database.module'
import { LoggerModule } from './logger/logger.module'
import { AuthModule } from './modules/auth/auth.module'
import { HealthModule } from './modules/health/health.module'
import { MetricsModule } from './modules/metrics/metrics.module'
import { QueueModule } from './modules/queue/queue.module'
import { RedisModule } from './modules/redis/redis.module'
import { HengModule } from './modules/heng/heng.module'
import { ReceiveModule } from './modules/receive/receive.module'
import { ProblemModule } from './modules/problem/problem.module'
import { SubmissionModule } from './modules/submission/submission.module'
import { TagModule } from './modules/tag/tag.module'
import { UserModule } from './modules/user/user.module'
import { ContestModule } from './modules/contest/contest.module'
import { CourseModule } from './modules/course/course.module'
import { ProfessionCollegeModule } from './modules/profession-college/profession-college.module'

@Module({
  imports: [
    // Config (global)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: ['.env'],
    }),

    // Logger (global pino)
    LoggerModule,

    // Database
    DatabaseModule,

    // Redis (global)
    RedisModule,

    // BullMQ Queues
    QueueModule,

    // Prometheus Metrics
    MetricsModule,

    // Health check
    HealthModule,

    // Auth
    AuthModule,

    // Heng 通信 + BullMQ 评测链路
    HengModule,

    // 评测结果接收处理
    ReceiveModule,

    // 题目模块
    ProblemModule,

    // 提交模块
    SubmissionModule,

    // 标签模块
    TagModule,

    // 用户模块
    UserModule,

    // 学院/专业模块
    ProfessionCollegeModule,

    // 竞赛模块
    ContestModule,

    // 课程模块
    CourseModule,
  ],
})
export class AppModule {}
