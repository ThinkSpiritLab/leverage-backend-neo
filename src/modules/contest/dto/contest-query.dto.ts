import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export type ContestStatus = 'upcoming' | 'ongoing' | 'ended';

export class ContestQueryDto {
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

  @ApiPropertyOptional({
    description: '竞赛状态过滤',
    enum: ['upcoming', 'ongoing', 'ended'],
  })
  @IsOptional()
  @IsEnum(['upcoming', 'ongoing', 'ended'])
  status?: ContestStatus;

  @ApiPropertyOptional({ description: '类型过滤：contest | exam' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '开始时间范围 from' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromTime?: Date;

  @ApiPropertyOptional({ description: '开始时间范围 to' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toTime?: Date;
}
