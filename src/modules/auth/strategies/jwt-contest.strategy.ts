import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { assertAccountActive } from '../account-auth.util';

export interface ContestJwtPayload {
  sub: number;
  contestId: number;
  role: 'contest-user';
}

@Injectable()
export class JwtContestStrategy extends PassportStrategy(
  Strategy,
  'jwt-contest',
) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.accessSecret') ??
        'default-access-secret',
    });
  }

  async validate(payload: ContestJwtPayload): Promise<ContestJwtPayload> {
    if (
      payload?.role !== 'contest-user' ||
      !Number.isInteger(payload.sub) ||
      !Number.isInteger(payload.contestId)
    ) {
      assertAccountActive(null);
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'status', 'statusEndsAt'],
    });
    assertAccountActive(user);

    return {
      sub: user.id,
      contestId: payload.contestId,
      role: 'contest-user',
    };
  }
}
