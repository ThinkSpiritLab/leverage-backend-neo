import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JUDGE_RX_QUEUE, JUDGE_TX_QUEUE } from './queue.constants'

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: JUDGE_TX_QUEUE },
      { name: JUDGE_RX_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
