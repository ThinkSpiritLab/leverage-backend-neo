import { ApiProperty } from '@nestjs/swagger'
import { ArrayMinSize, IsArray, IsInt } from 'class-validator'

export class LaunchMatchDto {
  @ApiProperty({ description: '游戏 ID' })
  @IsInt()
  gameId: number

  @ApiProperty({ description: '参赛者 ID 列表', type: [Number] })
  @IsArray()
  @ArrayMinSize(2)
  @IsInt({ each: true })
  gamerIds: number[]
}
