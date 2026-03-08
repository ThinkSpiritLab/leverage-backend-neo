import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'

export class ImportUserDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  @IsNotEmpty()
  username: string

  @ApiPropertyOptional({ description: '密码（不填则默认 nopassword）' })
  @IsOptional()
  @IsString()
  password?: string

  @ApiPropertyOptional({ description: '真实姓名' })
  @IsOptional()
  @IsString()
  certifiedName?: string

  @ApiPropertyOptional({ description: '学院' })
  @IsOptional()
  @IsString()
  college?: string

  @ApiPropertyOptional({ description: '专业' })
  @IsOptional()
  @IsString()
  profession?: string

  @ApiPropertyOptional({ description: '班级' })
  @IsOptional()
  @IsString()
  class?: string

  @ApiPropertyOptional({ description: '性别', enum: ['male', 'female', 'unknown'] })
  @IsOptional()
  @IsString()
  sex?: string

  @ApiPropertyOptional({ description: '年级' })
  @IsOptional()
  @IsString()
  grade?: string

  @ApiPropertyOptional({ description: '角色', enum: ['user', 'contest-user', 'guest'] })
  @IsOptional()
  @IsEnum(['user', 'contest-user', 'guest'])
  role?: string
}

export class ImportUsersDto {
  @ApiProperty({ description: '用户列表', type: [ImportUserDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportUserDto)
  users: ImportUserDto[]
}
