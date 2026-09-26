import { UnauthorizedException } from '@nestjs/common';

/** status=2 is a ban; a future end time makes that ban temporary. */
export function isAccountBlocked(
  status: number | null | undefined,
  statusEndsAt: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (status !== 2) return false;
  if (statusEndsAt == null) return true;

  const endsAt = new Date(statusEndsAt).getTime();
  return !Number.isFinite(endsAt) || endsAt > now;
}

export function assertAccountActive(
  user:
    | {
        status?: number | null;
        statusEndsAt?: Date | string | null;
      }
    | null
    | undefined,
): asserts user is NonNullable<typeof user> {
  if (!user || isAccountBlocked(user.status, user.statusEndsAt)) {
    throw new UnauthorizedException('账户不可用');
  }
}

export function mapAuthorityToRole(
  authority: string | null | undefined,
): string {
  switch (authority) {
    case 'superadmin':
    case 'sa':
      return 'sa';
    case 'admin':
    case 'supervisor':
      return authority;
    default:
      return 'user';
  }
}
