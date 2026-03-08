import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';
import { JwtPayload } from '../../modules/auth/strategies/jwt-access.strategy';

/**
 * 权限数字体系（数字越小权限越高）
 */
export const ROLE_WEIGHT: Record<string, number> = {
  sa: 0,
  admin: 1,
  supervisor: 2,
  user: 3,
  'contest-user': 4,
  guest: 5,
};

/**
 * 角色守卫：基于数字权重比较。
 * @Roles('admin') 表示"需要 admin 或更高权限（数字 ≤ 1）"
 *
 * 需要配合 JwtAuthGuard 使用（先验证 JWT，再检查角色）。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 没有 @Roles 装饰器则放行
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw new ForbiddenException('未认证用户');
    }

    const userWeight = ROLE_WEIGHT[user.role] ?? Number.MAX_SAFE_INTEGER;

    // 检查用户是否满足任意一个所需角色（weight ≤ required weight）
    const hasPermission = requiredRoles.some((role) => {
      const requiredWeight = ROLE_WEIGHT[role] ?? Number.MAX_SAFE_INTEGER;
      return userWeight <= requiredWeight;
    });

    if (!hasPermission) {
      throw new ForbiddenException(
        `权限不足，需要: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
