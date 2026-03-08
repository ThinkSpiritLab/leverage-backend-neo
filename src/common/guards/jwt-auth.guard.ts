import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';

/**
 * JWT 认证守卫，继承 PassportStrategy('jwt')。
 * 处理 token 过期和无效 token 的错误。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: TUser, info: any): TUser {
    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException('Token 已过期，请重新登录');
    }
    if (info instanceof JsonWebTokenError) {
      throw new UnauthorizedException('无效的 Token');
    }
    if (err || !user) {
      throw err ?? new UnauthorizedException('未授权');
    }
    return user;
  }
}
