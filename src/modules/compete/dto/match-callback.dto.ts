import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class MatchCallbackDto {
  @ApiProperty({ description: '外部评测 job ID' })
  @IsString()
  jobId: string;

  /** State at time of callback (pending/queued/compiling/running/finished/failed) */
  @ApiProperty({ description: '评测状态' })
  @IsString()
  @IsIn(['pending', 'queued', 'compiling', 'running', 'finished', 'failed'])
  state: string;

  @ApiProperty({ description: '评测类型' })
  @IsString()
  type: string;

  @ApiProperty({ description: '评测结果（terminal 状态时存在）', required: false })
  @IsOptional()
  @IsObject()
  result?: {
    verdict: string;
    rounds?: Record<string, unknown>[];
    /** Bot scores indexed by gamer id string: { "123": 5, "456": 3 } */
    finalResult?: Record<string, number>;
  };
}
