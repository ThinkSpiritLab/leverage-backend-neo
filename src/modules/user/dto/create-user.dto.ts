import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export type UserRole =
  | 'user'
  | 'admin'
  | 'superadmin'
  | 'sa'
  | 'supervisor'
  | 'contest-user'
  | 'guest';

export class CreateUserDto {
  @ApiProperty({ description: '用户名', example: 'zhangsan' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  username: string;

  @ApiProperty({ description: '密码', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'zhangsan@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: '角色',
    enum: [
      'user',
      'admin',
      'superadmin',
      'sa',
      'supervisor',
      'contest-user',
      'guest',
    ],
    default: 'user',
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
  role?: UserRole;

  @ApiPropertyOptional({ description: '学号', example: '2021001001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  studentId?: string;

  @ApiPropertyOptional({ description: '真实姓名' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  certifiedName?: string | null;

  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string | null;

  @ApiPropertyOptional({
    description: '性别',
    enum: ['male', 'female', 'unknown'],
  })
  @IsOptional()
  @IsEnum(['male', 'female', 'unknown'])
  sex?: string;

  @ApiPropertyOptional({ description: '年级' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  grade?: string;

  @ApiPropertyOptional({ description: '学院' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  college?: string;

  @ApiPropertyOptional({ description: '专业' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  profession?: string;

  @ApiPropertyOptional({ description: '班级' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  class?: string;

  @ApiPropertyOptional({ description: '账号状态（0=正常, 2=封禁）' })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiPropertyOptional({ description: '封禁截止时间（ISO8601）' })
  @IsOptional()
  @IsString()
  statusEndsAt?: string | null;

  @ApiPropertyOptional({ description: '封禁/备注原因' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string | null;
}
