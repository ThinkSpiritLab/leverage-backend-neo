import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UserQueryDto {
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
    description: '搜索关键词（username/email/studentId）',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: '角色过滤',
    enum: [
      'user',
      'admin',
      'superadmin',
      'sa',
      'supervisor',
      'contest-user',
      'guest',
    ],
  })
  @IsOptional()
  @IsEnum([
    'user',
    'admin',
    'superadmin',
    'sa',
    'supervisor',
    'contest-user',
    'guest',
  ])
  role?: string;

  @ApiPropertyOptional({ description: '学院过滤' })
  @IsOptional()
  @IsString()
  college?: string;

  @ApiPropertyOptional({ description: '专业过滤' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ description: '年级过滤' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ description: '排序字段', enum: ['id', 'accepts', 'submits', 'username'] })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  order?: string;
}
