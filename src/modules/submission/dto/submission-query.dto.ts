import { IsInt, IsNumber, IsOptional, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class SubmissionQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number = 20

  @ApiPropertyOptional({ description: '按用户 ID 筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number

  @ApiPropertyOptional({ description: '按题目 ID 筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  problemId?: number

  @ApiPropertyOptional({ description: '按提交状态筛选（整数枚举）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  status?: number

  @ApiPropertyOptional({ description: '按竞赛 ID 筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contestId?: number

  @ApiPropertyOptional({ description: '按课程 ID 筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number
}
