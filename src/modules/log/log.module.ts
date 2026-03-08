import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Log } from '../../database/entities/log.entity'
import { AuthModule } from '../auth/auth.module'
import { LogController } from './log.controller'
import { LogService } from './log.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Log]),
    AuthModule,
  ],
  controllers: [LogController],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
