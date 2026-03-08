import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ description: '游戏 ID' })
  @IsInt()
  @Min(1)
  gameId: number;
}
