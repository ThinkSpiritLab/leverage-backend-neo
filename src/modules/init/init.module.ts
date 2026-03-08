import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';
import { InitService } from './init.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Setting])],
  providers: [InitService],
})
export class InitModule {}
