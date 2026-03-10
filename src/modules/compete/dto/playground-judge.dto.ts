import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class BotSpec {
  /** 使用现有 gamer（gamerId 和 code 二选一） */
  @IsOptional()
  @IsInt()
  gamerId?: number;

  /** 内联代码 */
  @IsOptional()
  @IsString()
  code?: string;

  /** 语言（提供 code 时必填） */
  @IsOptional()
  @IsString()
  language?: string;
}

export class PlaygroundJudgeDto {
  /** 自定义裁判代码；不传则使用游戏自带 judgerCode */
  @IsOptional()
  @IsString()
  judgerCode?: string;

  @IsOptional()
  @IsString()
  judgerLanguage?: string;

  @ValidateNested()
  @Type(() => BotSpec)
  bot0: BotSpec;

  @ValidateNested()
  @Type(() => BotSpec)
  bot1: BotSpec;
}
