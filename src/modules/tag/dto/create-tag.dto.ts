import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ description: '标签名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '父标签 ID（用于层级结构）' })
  @IsOptional()
  @IsInt()
  parentId?: number | null;

  @ApiPropertyOptional({ description: '标签颜色（十六进制，如 #e63946）' })
  @IsOptional()
  @IsString()
  color?: string | null;
}
