import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'alice' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  username: string

  @ApiProperty({ description: '密码', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password: string
}
