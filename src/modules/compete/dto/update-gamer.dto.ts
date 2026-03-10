import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateGamerDto {
  @ApiPropertyOptional({ description: 'Bot 名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: '代码语言' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @ApiPropertyOptional({ description: '是否开源' })
  @IsOptional()
  @IsBoolean()
  opensource?: boolean;

  @ApiPropertyOptional({ description: 'Bot 代码' })
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  code?: string;
}
