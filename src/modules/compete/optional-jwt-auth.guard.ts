import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/** Public read stays anonymous unless credentials were supplied. */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>();
    if (!('authorization' in headers) && !('x-api-key' in headers)) return true;
    // Never silently downgrade invalid/expired credentials to anonymous access.
    return await super.canActivate(context);
  }
}
