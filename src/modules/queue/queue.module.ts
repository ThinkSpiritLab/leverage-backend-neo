import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { JUDGE_RX_QUEUE, JUDGE_TX_QUEUE } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: JUDGE_TX_QUEUE },
      { name: JUDGE_RX_QUEUE },
    ),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature(
      { name: JUDGE_TX_QUEUE, adapter: BullAdapter },
      { name: JUDGE_RX_QUEUE, adapter: BullAdapter },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
