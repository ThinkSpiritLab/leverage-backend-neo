import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

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
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.accessSecret') ??
        'default-access-secret',
    });
  }

  validate(payload: ContestJwtPayload): ContestJwtPayload {
    return {
      sub: payload.sub,
      contestId: payload.contestId,
      role: payload.role,
    };
  }
}
