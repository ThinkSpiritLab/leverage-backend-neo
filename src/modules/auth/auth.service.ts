import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { LOGIN_TOTAL_COUNTER } from '../metrics/metrics.module';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { Contest } from '../../database/entities/contest.entity';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';
import {
  hashPassword,
  isLegacyPasswordFormat,
  verifyPassword,
} from '../../common/utils/crypto.util';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
}

export interface ContestJwtPayload {
  sub: number;
  contestId: number;
  role: 'contest-user';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(ContestUser)
    private contestUserRepo: Repository<ContestUser>,
    @InjectRepository(Contest)
    private contestRepo: Repository<Contest>,
    @InjectRepository(Setting)
    private settingRepo: Repository<Setting>,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectMetric(LOGIN_TOTAL_COUNTER)
    private readonly loginCounter: Counter<string>,
  ) {}

  async registerUser(dto: {
    username: string;
    password: string;
    certifiedName?: string;
    email?: string;
  }): Promise<Omit<User, 'passwordHash'>> {
    const registerOpen = await this.settingRepo.findOne({
      where: { key: 'register.open' },
      cache: 12 * 1000,
    });
    const isOpen = !registerOpen || ['true', '1'].includes(registerOpen.valueString);
    if (!isOpen) {
      throw new ForbiddenException('当前站点未开放注册');
    }

    const exists = await this.userRepo.findOne({
      where: { username: dto.username },
      select: ['id'],
    });
    if (exists) {
      throw new ConflictException('用户名已存在');
    }

    void dto.email; // 当前 schema 暂不存 email，预留字段

    const created = this.userRepo.create({
      username: dto.username,
      passwordHash: hashPassword(dto.password),
      authority: 'user',
      certifiedName: dto.certifiedName ?? null,
    });

    const saved = await this.userRepo.save(created);
    const { passwordHash: _passwordHash, ...safeUser } = saved;
    return safeUser;
  }

  /**
   * 普通用户登录
   */
  async loginUser(
    username: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepo.findOne({
      where: { username },
      select: ['id', 'username', 'authority', 'passwordHash', 'status'],
    });

    if (!user) {
      this.loginCounter.labels({ success: 'false', type: 'user' }).inc();
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (!verifyPassword(password, user.passwordHash)) {
      this.loginCounter.labels({ success: 'false', type: 'user' }).inc();
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 自动升级旧格式密码
    await this.upgradePasswordIfNeeded(user, password);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: this.mapAuthority(user.authority),
    };

    this.loginCounter.labels({ success: 'true', type: 'user' }).inc();
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * 竞赛用户登录
   * - allowDirectLogin=true: 用全站密码验证（User.passwordHash）
   * - allowDirectLogin=false: 用竞赛独立密码（ContestUser.passwordHash）
   */
  async loginContest(
    contestId: number,
    username: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    // 找全站用户
    const user = await this.userRepo.findOne({
      where: { username },
      select: ['id', 'username', 'passwordHash'],
    });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 找 ContestUser
    const contestUser = await this.contestUserRepo.findOne({
      where: { contestId, userId: user.id },
      select: ['contestId', 'userId', 'passwordHash'],
    });
    if (!contestUser) {
      throw new UnauthorizedException('用户未加入该竞赛');
    }

    // 获取竞赛配置
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
    });
    if (!contest) {
      throw new UnauthorizedException('竞赛不存在');
    }

    if (contest.allowDirectLogin) {
      // 使用全站密码验证
      if (!verifyPassword(password, user.passwordHash)) {
        throw new UnauthorizedException('用户名或密码错误');
      }
    } else {
      // 竞赛独立密码验证
      if (contestUser.passwordHash === null) {
        // 没有独立密码时，不需要密码验证（直接通过）
      } else {
        if (!verifyPassword(password, contestUser.passwordHash)) {
          throw new UnauthorizedException('竞赛密码错误');
        }
      }
    }

    const payload: ContestJwtPayload = {
      sub: user.id,
      contestId,
      role: 'contest-user',
    };

    return {
      accessToken: this.generateContestToken(payload),
    };
  }

  /**
   * 用 refresh token 换新 access token
   */
  refreshToken(refreshToken: string): { accessToken: string } {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const newPayload: JwtPayload = {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
      };

      return { accessToken: this.generateAccessToken(newPayload) };
    } catch {
      throw new UnauthorizedException('Refresh token 无效或已过期');
    }
  }

  private generateAccessToken(payload: JwtPayload): string {
    const expiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '15m',
    );

    return this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: expiresIn as
        | `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`
        | undefined,
    });
  }

  private generateRefreshToken(payload: JwtPayload): string {
    const expiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );

    return this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: expiresIn as
        | `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`
        | undefined,
    });
  }

  private generateContestToken(payload: ContestJwtPayload): string {
    const expiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '15m',
    );

    return this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: expiresIn as
        | `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`
        | undefined,
    });
  }

  /**
   * 旧密码格式自动升级
   */
  private async upgradePasswordIfNeeded(
    user: User,
    plainPassword: string,
  ): Promise<void> {
    if (isLegacyPasswordFormat(user.passwordHash)) {
      const newHash = hashPassword(plainPassword);
      await this.userRepo.update(user.id, { passwordHash: newHash });
    }
  }

  /**
   * 将 User authority 字段映射到 role 字符串
   */
  private mapAuthority(authority: string): string {
    switch (authority) {
      case 'superadmin':
      case 'sa':
        return 'sa';
      case 'admin':
        return 'admin';
      case 'supervisor':
        return 'supervisor';
      default:
        return 'user';
    }
  }
}
