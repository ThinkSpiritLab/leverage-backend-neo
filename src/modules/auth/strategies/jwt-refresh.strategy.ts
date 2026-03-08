import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-access.strategy';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 从 body 提取
        (req: Request) =>
          (req?.body as { refreshToken?: string } | undefined)?.refreshToken ??
          null,
        // 从 Cookie 提取
        (req: Request) =>
          (req?.cookies as { refreshToken?: string } | undefined)
            ?.refreshToken ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.refreshSecret') ??
        'default-refresh-secret',
      passReqToCallback: false,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return { sub: payload.sub, username: payload.username, role: payload.role };
  }
}
