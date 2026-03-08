import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'

export class CreateContestDto {
  @ApiProperty({ description: '竞赛名称' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ description: '开始时间' })
  @Type(() => Date)
  @IsDate()
  startTime: Date

  @ApiProperty({ description: '结束时间' })
  @Type(() => Date)
  @IsDate()
  endTime: Date

  @ApiPropertyOptional({ description: '竞赛描述', default: '' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: '通知内容', default: '' })
  @IsOptional()
  @IsString()
  notification?: string

  @ApiPropertyOptional({ description: '是否允许直接登录（用全站密码）', default: true })
  @IsOptional()
  @IsBoolean()
  allowDirectLogin?: boolean

  @ApiPropertyOptional({ description: '是否公开', default: false })
  @IsOptional()
  @IsBoolean()
  public?: boolean

  @ApiPropertyOptional({ description: '是否开放注册', default: false })
  @IsOptional()
  @IsBoolean()
  openForRegistration?: boolean

  @ApiPropertyOptional({ description: '注册截止时间' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registrationEndTime?: Date

  @ApiPropertyOptional({ description: '罚时（分钟）', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  penalty?: number

  @ApiPropertyOptional({ description: '设备绑定类型', default: 0 })
  @IsOptional()
  @IsInt()
  deviceBindType?: number

  @ApiPropertyOptional({ description: '是否按分数计算', default: false })
  @IsOptional()
  @IsBoolean()
  scoreByPoint?: boolean

  @ApiPropertyOptional({ description: '是否完全封榜', default: false })
  @IsOptional()
  @IsBoolean()
  fullyFreeze?: boolean

  @ApiPropertyOptional({ description: '封榜时间（分钟，距结束）', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  freezeTime?: number

  @ApiPropertyOptional({ description: '题目 ID 列表' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  problemIds?: number[]
}
