import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class ProblemQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number = 20;

  @ApiPropertyOptional({ description: '搜索关键词（标题/逻辑ID）' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: '标签 ID 列表（逗号分隔或数组）',
    type: [Number],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(Number).filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.map(Number).filter(Boolean);
    }
    return [];
  })
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];

  @ApiPropertyOptional({ description: '单个标签 ID（兼容前端 tagId 参数）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tagId?: number;
}
