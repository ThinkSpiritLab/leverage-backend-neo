import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'API Key 名称', example: 'My Bot' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
