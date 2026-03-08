import { IsInt, IsOptional, IsString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class BatchUserProblemStatusDto {
  @ApiProperty({ description: '用户 ID' })
  @Type(() => Number)
  @IsInt()
  userId: number

  @ApiProperty({ description: '题目 ID 列表（逗号分隔字符串）' })
  @IsString()
  problemIds: string

  @ApiPropertyOptional({ description: '竞赛 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contestId?: number

  @ApiPropertyOptional({ description: '课程 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number
}
