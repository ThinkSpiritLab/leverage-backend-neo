import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class ContestUserDto {
  @ApiProperty({ description: '用户 ID' })
  @IsInt()
  userId: number;

  @ApiPropertyOptional({ description: '独立密码（不填则随机生成）' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: '座位号' })
  @IsOptional()
  @IsString()
  seat?: string;

  @ApiPropertyOptional({ description: '考场' })
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional({ description: '是否为野生参赛者', default: false })
  @IsOptional()
  @IsBoolean()
  wildcard?: boolean;

  @ApiPropertyOptional({ description: '是否为女队', default: false })
  @IsOptional()
  @IsBoolean()
  female?: boolean;
}

export class RegisterContestUserDto {
  @ApiPropertyOptional({ description: '用户 ID（不填则注册自己）' })
  @IsOptional()
  @IsInt()
  userId?: number;
}
