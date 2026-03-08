import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSubmissionDto {
  @ApiProperty({ description: '题目 ID' })
  @IsInt()
  @Min(1)
  problemId: number

  @ApiProperty({ description: '提交代码' })
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  code: string

  @ApiProperty({ description: '编程语言（整数枚举）', example: 1 })
  @IsNumber()
  language: number

  @ApiPropertyOptional({ description: '竞赛 ID（参加竞赛时传入）' })
  @IsOptional()
  @IsInt()
  contestId?: number

  @ApiPropertyOptional({ description: '课程 ID（课程内提交时传入）' })
  @IsOptional()
  @IsInt()
  courseId?: number
}
