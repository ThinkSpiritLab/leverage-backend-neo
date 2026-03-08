import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryMessageDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number = 10;

  @ApiPropertyOptional({
    description: '过滤已读/未读',
    enum: ['read', 'unread'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['read', 'unread'])
  filter?: 'read' | 'unread';
}
