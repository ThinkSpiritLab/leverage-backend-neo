import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class CreateProblemDto {
  @ApiProperty({ description: '题目标题' })
  @IsString()
  @MaxLength(200)
  title: string

  @ApiProperty({ description: '题目内容（Markdown）' })
  @IsString()
  @MaxLength(65536)
  content: string

  @ApiPropertyOptional({ description: '题目来源', default: 'Leverage' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string

  @ApiProperty({ description: '时间限制（ms）', example: 1000 })
  @IsInt()
  @Min(1)
  timeLimit: number

  @ApiProperty({ description: '内存限制（MB）', example: 64 })
  @IsInt()
  @Min(1)
  memoryLimit: number

  @ApiPropertyOptional({ description: '题目前缀', maxLength: 8, default: 'p' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  prefix?: string

  @ApiPropertyOptional({ description: '逻辑 ID（留空则自动分配）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  logicId?: number

  @ApiPropertyOptional({ description: '标签 ID 列表', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  tagIds?: number[]

  @ApiPropertyOptional({ description: '难度（1-5）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  difficulty?: number

  @ApiPropertyOptional({ description: '是否多组输入', default: false })
  @IsOptional()
  @IsBoolean()
  multiCases?: boolean

  @ApiPropertyOptional({ description: '是否限制访问（非 admin 不可见）', default: false })
  @IsOptional()
  @IsBoolean()
  restricted?: boolean

  @ApiPropertyOptional({ description: '是否关闭（对普通用户隐藏）', default: true })
  @IsOptional()
  @IsBoolean()
  closed?: boolean

  @ApiPropertyOptional({ description: 'SPJ 提交 ID' })
  @IsOptional()
  @IsNumber()
  spjId?: number

  @ApiPropertyOptional({ description: '创建者 ID' })
  @IsOptional()
  @IsInt()
  createrId?: number
}
