import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../../database/entities/user.entity'
import { InitService } from './init.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
  ],
  providers: [InitService],
})
export class InitModule {}
