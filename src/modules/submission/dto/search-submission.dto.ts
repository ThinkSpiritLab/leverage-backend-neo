import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchSubmissionDto {
  /** username or certifiedName */
  @ApiPropertyOptional({ description: '用户名或真实姓名（模糊）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  /** problem title or problemId */
  @ApiPropertyOptional({ description: '题目名称或编号（模糊）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '语言枚举值' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  language?: number;

  @ApiPropertyOptional({ description: '提交状态枚举值' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  status?: number;

  @ApiPropertyOptional({ description: '按用户 ID 精确筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}
