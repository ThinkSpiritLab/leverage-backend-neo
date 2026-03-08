import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ description: '通知标题', maxLength: 40 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  title: string;

  @ApiProperty({ description: '通知内容' })
  @IsString()
  content: string;

  @ApiProperty({ description: '是否高亮', required: false })
  @IsOptional()
  @IsBoolean()
  highlight?: boolean;
}
