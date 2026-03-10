import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateGamerDto {
  @ApiProperty({ description: '游戏 ID' })
  @IsInt()
  gameId: number;

  @ApiProperty({ description: 'Bot 名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Bot 类型', enum: ['code', 'webhook', 'human', 'external'], default: 'code', required: false })
  @IsOptional()
  @IsEnum(['code', 'webhook', 'human', 'external'])
  type?: 'code' | 'webhook' | 'human' | 'external';

  @ApiProperty({ description: '代码语言（type=code 时必填）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @ApiProperty({ description: '是否开源', required: false })
  @IsOptional()
  @IsBoolean()
  opensource?: boolean;

  @ApiProperty({ description: 'Bot 代码（type=code 时必填）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  code?: string;

  @ApiProperty({ description: 'Webhook URL（type=webhook 时必填）', required: false })
  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  webhookUrl?: string;

  @ApiProperty({ description: 'Webhook 签名密钥', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  webhookSecret?: string;

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
