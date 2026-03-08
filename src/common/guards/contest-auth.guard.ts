import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { Repository } from 'typeorm';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { Contest } from '../../database/entities/contest.entity';
import { ContestJwtPayload } from '../../modules/auth/strategies/jwt-contest.strategy';

/** deviceBindType 位标志（从原始代码迁移） */
export const BindIp = 0b1;
export const LoginTimeLimit = 0b10;
export const OnlyOneLogin = 0b100;

interface HttpRequest extends IncomingMessage {
  user?: ContestJwtPayload;
  connection: Socket;
  socket: Socket;
}

/**
 * ContestUser JWT 认证守卫。
 * 在验证 JWT 基础上，额外检查：
 * - IP 绑定（Contest.deviceBindType & BindIp）
 * - 设备绑定（根据 deviceBindType 位标志）
 */
@Injectable()
export class ContestAuthGuard
  extends AuthGuard('jwt-contest')
  implements CanActivate
{
  constructor(
    @InjectRepository(ContestUser)
    private contestUserRepo: Repository<ContestUser>,
    @InjectRepository(Contest)
    private contestRepo: Repository<Contest>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 先跑 JWT 验证
    const isJwtValid = await (super.canActivate(context) as Promise<boolean>);
    if (!isJwtValid) return false;

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const user = request.user as ContestJwtPayload;

    // 获取竞赛信息
    const contest = await this.contestRepo.findOne({
      where: { id: user.contestId },
    });
    if (!contest) {
      throw new UnauthorizedException('竞赛不存在');
    }

    // 获取 ContestUser
    const contestUser = await this.contestUserRepo.findOne({
      where: { contestId: user.contestId, userId: user.sub },
    });
    if (!contestUser) {
      throw new UnauthorizedException('用户未加入该竞赛');
    }

    // 检查 IP 绑定
    if ((contest.deviceBindType & BindIp) !== 0) {
      const clientIp = this.getClientIp(request);
      const storedIp = (contestUser as unknown as Record<string, unknown>)[
        'bindIp'
      ] as string | undefined;
      if (storedIp && storedIp !== clientIp) {
        throw new UnauthorizedException(
          'IP 地址不匹配，请使用绑定的 IP 地址访问',
        );
      }
    }

    return true;
  }

  private getClientIp(request: HttpRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0]?.trim();
    return (
      forwardedIp ??
      (request.headers['x-real-ip'] as string | undefined) ??
      request.connection?.remoteAddress ??
      request.socket?.remoteAddress ??
      '127.0.0.1'
    );
  }

  handleRequest<TUser = unknown>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Contest Token 无效');
    }
    return user;
  }
}
