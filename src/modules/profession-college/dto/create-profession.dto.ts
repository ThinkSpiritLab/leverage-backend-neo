import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProfessionDto {
  @ApiProperty({ description: '专业名称' })
  @IsString()
  @IsNotEmpty()
  profession: string;

  @ApiProperty({ description: '所属学院' })
  @IsString()
  @IsNotEmpty()
  college: string;
}
