import { IsArray, IsInt, IsNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class MergeProfessionDto {
  @ApiProperty({ description: '被合并的专业 ID 列表', type: [Number] })
  @IsArray()
  @IsNotEmpty()
  from: number[]

  @ApiProperty({ description: '合并目标专业 ID' })
  @IsInt()
  to: number
}
