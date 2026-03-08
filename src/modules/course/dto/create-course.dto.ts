import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateCourseDto {
  @ApiProperty({ description: '课程名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string

  @ApiProperty({ description: '开始时间' })
  @Type(() => Date)
  @IsDate()
  startTime: Date

  @ApiProperty({ description: '结束时间' })
  @Type(() => Date)
  @IsDate()
  endTime: Date

  @ApiPropertyOptional({ description: '教师', default: '' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  teacher?: string

  @ApiPropertyOptional({ description: '通知内容', default: '' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  notification?: string

  @ApiPropertyOptional({ description: '课程类型', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  type?: number

  @ApiPropertyOptional({ description: '是否归档', default: false })
  @IsOptional()
  @IsBoolean()
  archived?: boolean

  @ApiPropertyOptional({ description: '是否按分数计算', default: false })
  @IsOptional()
  @IsBoolean()
  scoreByPoint?: boolean

  @ApiPropertyOptional({ description: '允许的语言（JSON 字符串）' })
  @IsOptional()
  @IsString()
  enabledLanguageJSON?: string

  @ApiPropertyOptional({ description: '题目 ID 列表' })
  @IsOptional()
  problemIds?: number[]
}
