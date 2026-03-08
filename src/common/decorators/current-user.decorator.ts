import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from '../../modules/auth/strategies/jwt-access.strategy'

/**
 * 从请求中提取当前用户的 JWT payload。
 * 需要配合 JwtAuthGuard 使用。
 *
 * @example
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | unknown => {
    const request = ctx.switchToHttp().getRequest()
    const user = request.user as JwtPayload
    return data ? user?.[data] : user
  },
)
