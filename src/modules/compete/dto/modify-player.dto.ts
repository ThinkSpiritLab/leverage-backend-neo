import { ApiProperty } from '@nestjs/swagger'
import { IsInt, Min } from 'class-validator'

export class ModifyPlayerDto {
  @ApiProperty({ description: 'Bot 选手 ID' })
  @IsInt()
  @Min(1)
  gamerId: number

  @ApiProperty({ description: '位置索引（从 0 开始）' })
  @IsInt()
  @Min(0)
  index: number
}
