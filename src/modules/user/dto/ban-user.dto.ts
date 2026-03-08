import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class BanUserDto {
  @ApiPropertyOptional({ description: '封禁原因' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string

  @ApiPropertyOptional({ description: '是否封禁（false = 解封）', default: true })
  @IsBoolean()
  banned: boolean
}
