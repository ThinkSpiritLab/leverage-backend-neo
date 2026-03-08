import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Media } from '../../database/entities/media.entity';
import { AuthModule } from '../auth/auth.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media]),
    MulterModule.register({ dest: '/tmp/uploads' }),
    AuthModule,
  ],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
