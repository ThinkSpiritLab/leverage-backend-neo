import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCollegeDto {
  @ApiProperty({ description: '学院名称' })
  @IsString()
  @IsNotEmpty()
  college: string;
}
