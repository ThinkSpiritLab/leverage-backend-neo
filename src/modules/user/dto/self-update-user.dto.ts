import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Length, MaxLength } from 'class-validator'

export class SelfUpdateUserDto {
  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string

  @ApiPropertyOptional({ description: '真实姓名' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  certifiedName?: string

  @ApiPropertyOptional({ description: '学院' })
  @IsOptional()
  @IsString()
  college?: string

  @ApiPropertyOptional({ description: '专业' })
  @IsOptional()
  @IsString()
  profession?: string

  @ApiPropertyOptional({ description: '年级' })
  @IsOptional()
  @IsString()
  grade?: string

  @ApiPropertyOptional({ description: '班级' })
  @IsOptional()
  @IsString()
  class?: string

  @ApiPropertyOptional({ description: '性别', enum: ['male', 'female', 'unknown'] })
  @IsOptional()
  @IsString()
  sex?: string
}
