import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RejudgeDto {
  @ApiPropertyOptional({ description: '起始提交 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idStart?: number;

  @ApiPropertyOptional({ description: '结束提交 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idEnd?: number;

  @ApiPropertyOptional({ description: '起始时间（ISO 字符串）' })
  @IsOptional()
  @IsString()
  dateStart?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 字符串）' })
  @IsOptional()
  @IsString()
  dateEnd?: string;

  @ApiPropertyOptional({ description: '竞赛 ID（-1 表示无竞赛）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contestId?: number;

  @ApiPropertyOptional({ description: '课程 ID（-1 表示无课程）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: '用户 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: '题目 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  problemId?: number;

  @ApiPropertyOptional({ description: '提交状态枚举值' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}
