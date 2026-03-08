import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bull'
import { Submission } from '../../database/entities/submission.entity'
import { AuthModule } from '../auth/auth.module'
import { RankModule } from '../rank/rank.module'
import { JUDGE_TX_QUEUE } from '../queue/queue.constants'
import { TransmitController } from './transmit.controller'
import { TransmitService } from './transmit.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission]),
    BullModule.registerQueue({ name: JUDGE_TX_QUEUE }),
    AuthModule,
    RankModule,
  ],
  controllers: [TransmitController],
  providers: [TransmitService],
})
export class TransmitModule {}
