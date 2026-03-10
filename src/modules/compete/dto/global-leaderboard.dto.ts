import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GlobalLeaderboardDto {
  @ApiPropertyOptional({ description: '游戏 ID（不传则查全部游戏）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gameId?: number;

  @ApiPropertyOptional({ description: '最大返回数量（默认 20，最大 100）', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['inner', 'outer'], description: 'inner=elo 内榜，outer=eloExternal 外榜（默认 outer）', default: 'outer' })
  @IsOptional()
  @IsEnum(['inner', 'outer'])
  board?: 'inner' | 'outer' = 'outer';
}
