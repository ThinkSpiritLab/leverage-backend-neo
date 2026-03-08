import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class SearchUserDto {
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

  @ApiPropertyOptional({ description: '用户名/真实姓名模糊搜索' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ description: '年级' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  grade?: string

  @ApiPropertyOptional({ description: '学院' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  college?: string

  @ApiPropertyOptional({ description: '专业' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  profession?: string

  @ApiPropertyOptional({ description: '班级' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  class?: string
}
