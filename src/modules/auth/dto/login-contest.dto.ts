import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class LoginContestDto {
  @ApiProperty({ description: '竞赛 ID', example: 1 })
  @IsInt()
  @Min(1)
  contestId: number;

  @ApiProperty({ description: '用户名', example: 'alice' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  username: string;

  @ApiProperty({ description: '密码', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password: string;
}
