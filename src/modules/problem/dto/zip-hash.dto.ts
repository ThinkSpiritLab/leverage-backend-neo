import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ZipHashDto {
  @ApiPropertyOptional({
    description: '对所有有测试数据的题目执行',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({ description: '题目 ID 列表', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  problems?: number[];
}
