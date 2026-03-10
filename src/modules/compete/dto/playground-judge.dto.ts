import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class BotSpec {
  /** 使用现有 gamer（gamerId 和 code 二选一） */
  @ApiPropertyOptional({ description: '使用已有 Gamer 的 ID（与 code 二选一）' })
  @IsOptional()
  @IsInt()
  gamerId?: number;

  /** 内联代码 */
  @ApiPropertyOptional({ description: '内联代码（与 gamerId 二选一）' })
  @IsOptional()
  @IsString()
  code?: string;

  /** 语言（提供 code 时必填） */
  @ApiPropertyOptional({ description: '语言（提供 code 时必填，例如 python3 / cpp17）' })
  @IsOptional()
  @IsString()
  language?: string;
}

export class PlaygroundJudgeDto {
  /** 自定义裁判代码；不传则使用游戏自带 judgerCode */
  @ApiPropertyOptional({ description: '自定义裁判代码（不传时使用游戏自带）' })
  @IsOptional()
  @IsString()
  judgerCode?: string;

  @ApiPropertyOptional({ description: '自定义裁判语言（配合 judgerCode 使用，默认 python）' })
  @IsOptional()
  @IsString()
  judgerLanguage?: string;

  @ApiProperty({ type: () => BotSpec, description: 'Bot 0（先手）规格' })
  @ValidateNested()
  @Type(() => BotSpec)
  bot0: BotSpec;

  @ApiProperty({ type: () => BotSpec, description: 'Bot 1（后手）规格' })
  @ValidateNested()
  @Type(() => BotSpec)
  bot1: BotSpec;
}
