import { IsArray, IsInt, IsNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class MergeCollegeDto {
  @ApiProperty({ description: '被合并的学院 ID 列表', type: [Number] })
  @IsArray()
  @IsNotEmpty()
  from: number[]

  @ApiProperty({ description: '合并目标学院 ID' })
  @IsInt()
  to: number
}
