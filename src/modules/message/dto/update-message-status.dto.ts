import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateMessageStatusDto {
  @ApiProperty({
    description: '目标状态',
    enum: ['read', 'unread', 'closed', 'deleted'],
  })
  @IsString()
  @IsIn(['read', 'unread', 'closed', 'deleted'])
  status: 'read' | 'unread' | 'closed' | 'deleted';
}
