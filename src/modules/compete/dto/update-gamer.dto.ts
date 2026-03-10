import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
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

  @ApiPropertyOptional({ description: 'Bot 类型', enum: ['code', 'webhook', 'human', 'external'] })
  @IsOptional()
  @IsEnum(['code', 'webhook', 'human', 'external'])
  type?: 'code' | 'webhook' | 'human' | 'external';

  @ApiPropertyOptional({ description: 'Webhook URL（type=webhook时必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Webhook 密钥' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  webhookSecret?: string;
}
