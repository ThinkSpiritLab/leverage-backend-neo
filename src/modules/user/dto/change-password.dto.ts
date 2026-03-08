import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MinLength } from 'class-validator'

export class ChangePasswordDto {
  @ApiProperty({ description: '旧密码' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string

  @ApiProperty({ description: '新密码' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string
}
