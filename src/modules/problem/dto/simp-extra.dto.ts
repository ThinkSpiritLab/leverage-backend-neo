import { IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class SimpExtraDto {
  @ApiProperty({ description: '题目标题' })
  @IsString()
  title: string

  @ApiPropertyOptional({ description: '题目前缀', maxLength: 8, default: 'p' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  prefix?: string
}
