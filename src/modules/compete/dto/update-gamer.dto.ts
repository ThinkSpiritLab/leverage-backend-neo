import { PartialType } from '@nestjs/swagger';
import { CreateGamerDto } from './create-gamer.dto';

export class UpdateGamerDto extends PartialType(CreateGamerDto) {}
