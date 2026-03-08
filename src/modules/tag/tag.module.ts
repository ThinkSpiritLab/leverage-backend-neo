import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from '../../database/entities/tag.entity';
import { AuthModule } from '../auth/auth.module';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tag]), AuthModule],
  controllers: [TagController],
  providers: [TagService],
  exports: [TagService],
})
export class TagModule {}
