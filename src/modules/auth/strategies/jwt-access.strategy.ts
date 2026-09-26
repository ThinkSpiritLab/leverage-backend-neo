import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { assertAccountActive, mapAuthorityToRole } from '../account-auth.util';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
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

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Contest tokens use the same signing key but a separate Passport strategy.
    if (
      !Number.isInteger(payload?.sub) ||
      typeof payload.username !== 'string' ||
      typeof payload.role !== 'string' ||
      payload.role === 'contest-user' ||
      'contestId' in (payload as object)
    ) {
      assertAccountActive(null);
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'username', 'authority', 'status', 'statusEndsAt'],
    });
    assertAccountActive(user);

    return {
      sub: user.id,
      username: user.username,
      role: mapAuthorityToRole(user.authority),
    };
  }
}
