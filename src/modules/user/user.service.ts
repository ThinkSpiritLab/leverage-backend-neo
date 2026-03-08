import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Authority, User } from '../../database/entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { hashPassword, verifyPassword } from '../../common/utils/crypto.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { ImportUserDto } from './dto/import-users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/**
 * 角色权重（数字越小权限越高）
 * sa=0 < admin=1 < supervisor=2 < user=3 < contest-user=4 < guest=5
 */
export const ROLE_WEIGHT: Record<string, number> = {
  sa: 0,
  superadmin: 0,
  admin: 1,
  supervisor: 2,
  user: 3,
  'contest-user': 4,
  guest: 5,
};

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 列表（分页 + 搜索）
   */
  async findAll(
    query: UserQueryDto,
  ): Promise<{ items: User[]; total: number }> {
    const {
      page = 1,
      perPage = 20,
      search,
      role,
      college,
      profession,
      grade,
      sort,
      order,
    } = query;
    const skip = (page - 1) * perPage;

    const allowedSortFields: Record<string, string> = {
      id: 'u.id',
      accepts: 'u.accepts',
      submits: 'u.submits',
      username: 'u.username',
    };
    const sortField = allowedSortFields[sort ?? ''] ?? 'u.id';
    const sortOrder = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.userRepo
      .createQueryBuilder('u')
      .take(perPage)
      .skip(skip)
      .orderBy(sortField, sortOrder);

    if (search) {
      qb.andWhere(
        '(u.username LIKE :search OR u.certifiedName LIKE :search OR u.grade LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      // map role string to authority field value
      const authority = role === 'sa' ? 'superadmin' : role;
      qb.andWhere('u.authority = :authority', { authority });
    }

    if (college) qb.andWhere('u.college = :college', { college });
    if (profession) qb.andWhere('u.profession = :profession', { profession });
    if (grade) qb.andWhere('u.grade = :grade', { grade });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * 详情
   */
  async findOne(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);
    return user;
  }

  /**
   * 创建（hash 密码）
   */
  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (exists) throw new ConflictException('用户名已存在');

    const user = this.userRepo.create({
      username: dto.username,
      passwordHash: hashPassword(dto.password),
      nickname: dto.nickname ?? null,
      sex: dto.sex ?? 'unknown',
      authority: dto.role === 'sa' ? 'superadmin' : (dto.role ?? 'user'),
      certifiedName: dto.certifiedName ?? null,
      grade: dto.grade ?? null,
      college: dto.college ?? null,
      profession: dto.profession ?? null,
      class: dto.class ?? null,
    });

    return this.userRepo.save(user);
  }

  /**
   * 更新（admin 才能改 role，需要权限校验）
   */
  async update(
    id: number,
    dto: UpdateUserDto,
    operatorRole: string,
  ): Promise<User> {
    const user = await this.findOne(id);

    // 权限校验：操作者必须能管理目标用户
    if (
      !this.canManage(operatorRole, this.mapAuthorityToRole(user.authority))
    ) {
      throw new ForbiddenException('权限不足，无法管理该用户');
    }

    // 如果要改 role，确保操作者有权任命
    if (dto.role !== undefined) {
      const newRole = dto.role === 'sa' ? 'superadmin' : dto.role;
      if (!this.canManage(operatorRole, dto.role)) {
        throw new ForbiddenException('权限不足，无法赋予该角色');
      }
      if (dto.role === 'sa') {
        throw new ForbiddenException('无法通过 API 直接任命超级管理员');
      }
      user.authority = newRole as Authority;
    }

    if (dto.password) {
      user.passwordHash = hashPassword(dto.password);
    }
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email ?? null;
    if (dto.studentId !== undefined) user.studentId = dto.studentId ?? null;
    if (dto.nickname !== undefined) user.nickname = dto.nickname ?? null;
    if (dto.sex !== undefined) user.sex = dto.sex;
    if (dto.certifiedName !== undefined)
      user.certifiedName = dto.certifiedName ?? null;
    if (dto.grade !== undefined) user.grade = dto.grade ?? null;
    if (dto.college !== undefined) user.college = dto.college ?? null;
    if (dto.profession !== undefined) user.profession = dto.profession ?? null;
    if (dto.class !== undefined) user.class = dto.class ?? null;

    return this.userRepo.save(user);
  }

  /**
   * 删除
   */
  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepo.remove(user);
  }

  /**
   * 修改密码（需要旧密码验证）
   */
  async changePassword(id: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id },
      select: ['id', 'username', 'passwordHash'],
    });
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);

    if (!verifyPassword(dto.oldPassword, user.passwordHash)) {
      throw new UnauthorizedException('旧密码错误');
    }

    user.passwordHash = hashPassword(dto.newPassword);
    await this.userRepo.save(user);
  }

  /**
   * 批量导入（验证学院/专业）
   */
  async importUsers(
    users: ImportUserDto[],
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const u of users) {
      try {
        if (!u.username) {
          throw new Error('用户名未定义');
        }

        const exists = await this.userRepo.findOne({
          where: { username: u.username },
        });
        if (exists) {
          throw new Error(`用户 ${u.username} 已存在`);
        }

        const user = this.userRepo.create({
          username: u.username,
          passwordHash: hashPassword(u.password || 'nopassword'),
          certifiedName: u.certifiedName ?? null,
          college: u.college ?? null,
          profession: u.profession ?? null,
          class: u.class ?? null,
          sex: u.sex
            ? ({ 男: 'male', 女: 'female' }[u.sex] ?? u.sex)
            : 'unknown',
          grade: u.grade ?? null,
          authority: u.role ?? 'user',
        });

        await this.userRepo.save(user);
        success++;
      } catch (err) {
        failed++;
        const errMsg = (err as { message?: string })?.message ?? String(err);
        errors.push(`[${u.username}] ${errMsg}`);
        this.logger.warn(`importUsers error for ${u.username}: ${errMsg}`);
      }
    }

    return { success, failed, errors };
  }

  /**
   * 权限比较：操作者能否管理目标用户
   * 权重：sa=0 < admin=1 < supervisor=2 < user=3 < contest-user=4 < guest=5
   * 操作者权重 < 目标权重才能管理
   *
   * 特殊规则：
   * - supervisor 只能查看，不能修改任何用户（canManage 始终返回 false）
   * - admin 能管理 supervisor 及以下（不能管理 sa/admin）
   * - 只有 sa 能管理 admin
   */
  canManage(operatorRole: string, targetRole: string): boolean {
    // supervisor 只有查看权限，不能管理任何人
    if (operatorRole === 'supervisor') return false;

    const opWeight = ROLE_WEIGHT[operatorRole] ?? Number.MAX_SAFE_INTEGER;
    const tgtWeight = ROLE_WEIGHT[targetRole] ?? Number.MAX_SAFE_INTEGER;
    return opWeight < tgtWeight;
  }

  /**
   * 查用户-题目做题状态（Redis Hash）
   */
  async getUserProblemStatus(
    userId: number,
    problemIds: number[],
  ): Promise<Map<number, number>> {
    const key = `user-problem-status:${userId}`;
    const result = new Map<number, number>();

    if (problemIds.length === 0) return result;

    const fields = problemIds.map((id) => id.toString());
    const values = await Promise.all(
      fields.map((f) => this.redisService.hget(key, f)),
    );

    for (let i = 0; i < problemIds.length; i++) {
      const val = values[i];
      if (val !== null) {
        result.set(problemIds[i], parseInt(val));
      }
    }

    return result;
  }

  /**
   * 将 authority 字段转为 role 字符串
   */
  private mapAuthorityToRole(authority: string): string {
    if (authority === 'superadmin') return 'sa';
    return authority;
  }

  /**
   * 获取用户通过的题目列表（去重，status=0 AC）
   */
  async getAcceptedProblems(userId: number): Promise<{ items: { id: number; logicId: number; prefix: string; title: string }[] }> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT p.id, p.logicId, p.prefix, p.title
       FROM submission s
       JOIN problem p ON p.id = s.problemId
       WHERE s.userId = ? AND s.status = 0
       ORDER BY p.logicId ASC`,
      [userId],
    );
    return { items: rows };
  }
}
