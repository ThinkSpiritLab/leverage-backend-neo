import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Suspicion } from '../../database/entities/suspicion.entity';
import { AuthModule } from '../auth/auth.module';
import { SuspicionController } from './suspicion.controller';
import { SuspicionService } from './suspicion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Suspicion]), AuthModule],
  controllers: [SuspicionController],
  providers: [SuspicionService],
  exports: [SuspicionService],
})
export class SuspicionModule {}
