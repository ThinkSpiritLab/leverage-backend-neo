import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { MetricsAuthMiddleware } from './common/middleware/metrics-auth.middleware';
import { BullBoardAuthMiddleware } from './common/middleware/bull-board-auth.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { QueueModule } from './modules/queue/queue.module';
import { RedisModule } from './modules/redis/redis.module';
import { HengModule } from './modules/heng/heng.module';
import { ReceiveModule } from './modules/receive/receive.module';
import { ProblemModule } from './modules/problem/problem.module';
import { SubmissionModule } from './modules/submission/submission.module';
import { TagModule } from './modules/tag/tag.module';
import { UserModule } from './modules/user/user.module';
import { ContestModule } from './modules/contest/contest.module';
import { CourseModule } from './modules/course/course.module';
import { ProfessionCollegeModule } from './modules/profession-college/profession-college.module';
import { SettingModule } from './modules/setting/setting.module';
import { LogModule } from './modules/log/log.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MediaModule } from './modules/media/media.module';
import { SuspicionModule } from './modules/suspicion/suspicion.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { InitModule } from './modules/init/init.module';
import { CompeteModule } from './modules/compete/compete.module';
import { TransmitModule } from './modules/transmit/transmit.module';
import { MessageModule } from './modules/message/message.module';

@Module({
  imports: [
    // Config (global)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: ['.env'],
    }),

    // Rate limiting (global)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 60,
      },
    ]),

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

    // 系统设置模块
    SettingModule,

    // 操作日志模块
    LogModule,

    // 通知模块
    NotificationModule,

    // 媒体文件模块
    MediaModule,

    // 防作弊模块
    SuspicionModule,

    // 统计模块
    StatisticsModule,

    // 首次启动初始化
    InitModule,

    // Bot 对战模块
    CompeteModule,

    // 运维工具模块
    TransmitModule,

    // 站内信模块
    MessageModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Protect /metrics from public access (IP whitelist + optional Bearer token)
    consumer
      .apply(MetricsAuthMiddleware)
      .forRoutes({ path: 'metrics', method: RequestMethod.GET });

    // Protect Bull Board UI — requires valid admin JWT (?token=xxx or Authorization: Bearer xxx)
    // Apply to all routes; middleware internally checks req.path.startsWith('/admin/queues')
    consumer
      .apply(BullBoardAuthMiddleware)
      .forRoutes('*');

    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
