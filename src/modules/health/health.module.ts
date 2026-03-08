import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { HealthController } from './health.controller';

@Module({
  imports: [TypeOrmModule, BullModule.registerQueue({ name: JUDGE_TX_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
