import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetSettingDto {
  @ApiProperty({ description: '配置 key' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ description: '配置值' })
  @IsString()
  value: string;
}
