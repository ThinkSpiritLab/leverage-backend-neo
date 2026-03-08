import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGameDto {
  @ApiProperty({ description: '游戏名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: '游戏描述' })
  @IsString()
  @MaxLength(4096)
  description: string;

  @ApiProperty({ description: '时间限制（ms）' })
  @IsInt()
  @Min(1)
  timeLimit: number;

  @ApiProperty({ description: '内存限制（MB）' })
  @IsInt()
  @Min(1)
  memoryLimit: number;

  @ApiProperty({ description: '参赛人数', default: 2 })
  @IsInt()
  @Min(2)
  gamerQuantity: number;

  @ApiProperty({ description: '裁判代码' })
  @IsString()
  @MaxLength(65536)
  judgerCode: string;

  @ApiProperty({ description: '裁判代码语言' })
  @IsString()
  @MaxLength(32)
  judgerLanguage: string;

  @ApiProperty({ description: '是否禁用', required: false })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
