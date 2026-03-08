import { IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddTagDto {
  @ApiProperty({ description: '标签 ID' })
  @IsInt()
  @Type(() => Number)
  tagId: number;
}
