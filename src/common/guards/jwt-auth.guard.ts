import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';

import { ApiKeyService } from '../../modules/auth/api-key.service';

/**
 * JWT 认证守卫，继承 PassportStrategy('jwt')。
 * 同时支持 X-API-Key header 认证（优先于 Bearer token）。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private apiKeyService: ApiKeyService | null = null;

  constructor(private readonly moduleRef: ModuleRef) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    const apiKeyHeader = request.headers['x-api-key'];

    if (apiKeyHeader) {
      // 延迟解析，避免循环依赖
      if (!this.apiKeyService) {
        this.apiKeyService = this.moduleRef.get(ApiKeyService, {
          strict: false,
        });
      }
      const user = await this.apiKeyService.validateApiKey(apiKeyHeader);
      if (!user) {
        throw new UnauthorizedException('无效的 API Key');
      }
      request.user = user;
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
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
