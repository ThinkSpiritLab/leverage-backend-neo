import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

export class SubmitGamerDto {
  @ApiProperty({ description: 'Bot 选手 ID' })
  @IsInt()
  @Min(1)
  gamerId: number

  @ApiProperty({ description: '备注信息', required: false })
  @IsOptional()
  @IsString()
  message?: string
}
