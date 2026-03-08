import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateGamerDto {
  @ApiProperty({ description: '游戏 ID' })
  @IsInt()
  gameId: number

  @ApiProperty({ description: 'Bot 名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string

  @ApiProperty({ description: '代码语言' })
  @IsString()
  @MaxLength(32)
  language: string

  @ApiProperty({ description: '是否开源' })
  @IsBoolean()
  opensource: boolean

  @ApiProperty({ description: 'Bot 代码' })
  @IsString()
  @MaxLength(65536)
  code: string

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  note?: string
}
