import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type Role =
  | 'sa'
  | 'admin'
  | 'supervisor'
  | 'user'
  | 'contest-user'
  | 'guest';

/**
 * 声明接口需要的最低角色级别。
 * 权限数字体系：数字越小权限越高。
 * 使用示例：@Roles('admin') 表示需要 admin 或更高权限（即 sa 或 admin）
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
