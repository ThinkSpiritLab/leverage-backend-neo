import { IsNumber, IsString } from 'class-validator';

export class PlaygroundDto {
  @IsString()
  language: string;

  @IsString()
  code: string;

  @IsNumber()
  opponentGamerId: number;
}
