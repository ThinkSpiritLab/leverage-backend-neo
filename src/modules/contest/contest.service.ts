import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Contest } from '../../database/entities/contest.entity';
import { ContestProblem } from '../../database/entities/contest-problem.entity';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity';
import { User } from '../../database/entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { hashPassword } from '../../common/utils/crypto.util';
import { CreateContestDto } from './dto/create-contest.dto';
import { UpdateContestDto } from './dto/update-contest.dto';
import { ContestQueryDto } from './dto/contest-query.dto';
import { ContestUserDto } from './dto/contest-user.dto';

export interface RankItem {
  rank: number;
  userId: number;
  username: string;
  certifiedName: string | null;
  score: number;
  accepts: number;
  submits: number;
}

@Injectable()
export class ContestService {
  private readonly logger = new Logger(ContestService.name);

  constructor(
    @InjectRepository(Contest)
    private readonly contestRepo: Repository<Contest>,
    @InjectRepository(ContestProblem)
    private readonly contestProblemRepo: Repository<ContestProblem>,
    @InjectRepository(ContestUser)
    private readonly contestUserRepo: Repository<ContestUser>,
    @InjectRepository(ContestUserProblem)
    private readonly contestUserProblemRepo: Repository<ContestUserProblem>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 竞赛列表（支持 upcoming/ongoing/ended 过滤）
   */
  async findAll(
    query: ContestQueryDto,
  ): Promise<{ items: Contest[]; total: number }> {
    const { page = 1, perPage = 20, status, fromTime, toTime, type } = query;
    const skip = (page - 1) * perPage;
    const now = new Date();

    const qb = this.contestRepo
      .createQueryBuilder('c')
      .take(perPage)
      .skip(skip)
      .orderBy('c.id', 'DESC');

    if (status === 'upcoming') {
      qb.andWhere('c.startTime > :now', { now });
    } else if (status === 'ongoing') {
      qb.andWhere('c.startTime <= :now AND c.endTime >= :now', { now });
    } else if (status === 'ended') {
      qb.andWhere('c.endTime < :now', { now });
    }

    if (fromTime) qb.andWhere('c.startTime >= :fromTime', { fromTime });
    if (toTime) qb.andWhere('c.startTime <= :toTime', { toTime });
    if (type) qb.andWhere('c.type = :type', { type });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * 竞赛详情（含题目列表）
   */
  async findOne(id: number): Promise<Contest & { problems: (ContestProblem & { title?: string; logicId?: string })[] }> {
    const contest = await this.contestRepo.findOne({ where: { id } });
    if (!contest) throw new NotFoundException(`竞赛 ${id} 不存在`);

    const problems = await this.contestProblemRepo
      .createQueryBuilder('cp')
      .leftJoin('problem', 'p', 'p.id = cp.problemId')
      .addSelect(['p.title', 'p.logicId'])
      .where('cp.contestId = :id', { id })
      .orderBy('cp.label', 'ASC')
      .getRawAndEntities();

    const enriched = problems.entities.map((cp, i) => ({
      ...cp,
      title: problems.raw[i]?.p_title ?? undefined,
      logicId: problems.raw[i]?.p_logicId ?? undefined,
    }));

    return { ...contest, problems: enriched };
  }

  /**
   * 创建竞赛
   */
  async create(dto: CreateContestDto): Promise<Contest> {
    const { problemIds, ...contestData } = dto;

    const contest = await this.contestRepo.save(
      this.contestRepo.create({
        name: contestData.name,
        startTime: contestData.startTime,
        endTime: contestData.endTime,
        description: contestData.description ?? '',
        notification: contestData.notification ?? '',
        allowDirectLogin: contestData.allowDirectLogin ?? true,
        public: contestData.public ?? false,
        openForRegistration: contestData.openForRegistration ?? false,
        registrationEndTime: contestData.registrationEndTime ?? null,
        penalty: contestData.penalty ?? 20,
        deviceBindType: contestData.deviceBindType ?? 0,
        scoreByPoint: contestData.scoreByPoint ?? false,
        fullyFreeze: contestData.fullyFreeze ?? false,
        freezeTime: contestData.freezeTime ?? 0,
      }),
    );

    // 添加题目
    if (problemIds && problemIds.length > 0) {
      await this.addProblems(contest.id, problemIds);
    }

    return contest;
  }

  /**
   * 更新竞赛
   */
  async update(id: number, dto: UpdateContestDto): Promise<Contest> {
    const contest = await this.contestRepo.findOne({ where: { id } });
    if (!contest) throw new NotFoundException(`竞赛 ${id} 不存在`);

    const { problemIds, ...updateData } = dto;
    Object.assign(contest, updateData);
    const saved = await this.contestRepo.save(contest);

    if (problemIds !== undefined) {
      // 替换题目列表
      await this.contestProblemRepo.delete({ contestId: id });
      if (problemIds.length > 0) {
        await this.addProblems(id, problemIds);
      }
    }

    return saved;
  }

  /**
   * 删除竞赛
   */
  async remove(id: number): Promise<void> {
    const contest = await this.contestRepo.findOne({ where: { id } });
    if (!contest) throw new NotFoundException(`竞赛 ${id} 不存在`);
    await this.contestRepo.remove(contest);
    // 清理 Redis 排行榜
    await this.redisService.del(`contest-rank:${id}`);
  }

  /**
   * ContestUser 单个注册
   */
  async registerUser(contestId: number, userId: number): Promise<ContestUser> {
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
    });
    if (!contest) throw new NotFoundException(`竞赛 ${contestId} 不存在`);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`用户 ${userId} 不存在`);

    const existing = await this.contestUserRepo.findOne({
      where: { contestId, userId },
    });
    if (existing) throw new ConflictException('用户已注册该竞赛');

    return this.contestUserRepo.save(
      this.contestUserRepo.create({ contestId, userId }),
    );
  }

  async getContestUsers(contestId: number): Promise<User[]> {
    const contest = await this.contestRepo.findOne({ where: { id: contestId } });
    if (!contest) throw new NotFoundException(`竞赛 ${contestId} 不存在`);

    const contestUsers = await this.contestUserRepo.find({
      where: { contestId },
      relations: ['user'],
      order: { userId: 'ASC' },
    });

    return contestUsers
      .map((contestUser) => contestUser.user as User)
      .filter((user): user is User => Boolean(user));
  }

  /**
   * ContestUser 批量导入（生成随机密码）
   */
  async importContestUsers(
    contestId: number,
    users: ContestUserDto[],
  ): Promise<ContestUser[]> {
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
    });
    if (!contest) throw new NotFoundException(`竞赛 ${contestId} 不存在`);

    const result: ContestUser[] = [];

    for (const u of users) {
      try {
        const existing = await this.contestUserRepo.findOne({
          where: { contestId, userId: u.userId },
        });

        if (existing) {
          // 更新信息
          Object.assign(existing, {
            seat: u.seat ?? existing.seat,
            room: u.room ?? existing.room,
            wildcard: u.wildcard ?? existing.wildcard,
            female: u.female ?? existing.female,
          });
          if (u.password) {
            existing.passwordHash = hashPassword(u.password);
          }
          result.push(await this.contestUserRepo.save(existing));
        } else {
          // 新建
          const password = u.password ?? randomBytes(4).toString('hex');
          const contestUser = this.contestUserRepo.create({
            contestId,
            userId: u.userId,
            passwordHash: hashPassword(password),
            seat: u.seat ?? null,
            room: u.room ?? null,
            wildcard: u.wildcard ?? false,
            female: u.female ?? false,
          });
          result.push(await this.contestUserRepo.save(contestUser));
        }
      } catch (err) {
        this.logger.warn(
          `importContestUsers error for userId ${u.userId}: ${err.message}`,
        );
      }
    }

    return result;
  }

  /**
   * 排行榜（从 Redis Sorted Set 读，O(log N)）
   */
  async getRanking(
    contestId: number,
    page: number,
    perPage: number,
  ): Promise<RankItem[]> {
    const key = `contest-rank:${contestId}`;
    const start = (page - 1) * perPage;
    const stop = start + perPage - 1;

    // ZREVRANGE 取分数最高（AC 多、罚时少）
    const entries = await this.redisService.zrevrange(key, start, stop);

    if (entries.length === 0) return [];

    const userIds = entries.map((e) => parseInt(e));

    // 批量查用户信息
    const users = await this.userRepo.findByIds(userIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 批量查竞赛用户统计
    const contestUsers = await this.contestUserRepo.find({
      where: userIds.map((uid) => ({ contestId, userId: uid })),
    });
    const contestUserMap = new Map(contestUsers.map((cu) => [cu.userId, cu]));

    // 获取分数（用 zscore 批量获取）
    const scores = await Promise.all(
      entries.map((e) => this.redisService.zscore(key, e)),
    );

    return entries.map((entry, index) => {
      const userId = parseInt(entry);
      const user = userMap.get(userId);
      const cu = contestUserMap.get(userId);
      const scoreRaw = scores[index];

      return {
        rank: start + index + 1,
        userId,
        username: user?.username ?? String(userId),
        certifiedName: user?.certifiedName ?? null,
        score: scoreRaw ? parseFloat(scoreRaw) : 0,
        accepts: cu?.accepts ?? 0,
        submits: cu?.submits ?? 0,
      };
    });
  }

  /**
   * 获取气球列表（ContestUserProblem 首次 AC 记录，sent=false）
   */
  async getBalloons(contestId: number): Promise<ContestUserProblem[]> {
    return this.contestUserProblemRepo
      .createQueryBuilder('cup')
      .where('cup.contestUserContestId = :contestId', { contestId })
      .andWhere('cup.sent = false')
      .orderBy('cup.createdAt', 'ASC')
      .getMany();
  }

  /**
   * 标记气球已送
   */
  async markBalloonDelivered(id: number): Promise<void> {
    // id 是 contestProblemId（联合主键的一部分），需要特殊处理
    // 这里用 contestProblemId 当查找条件
    const result = await this.contestUserProblemRepo.update(
      { contestProblemId: id, sent: false },
      { sent: true },
    );
    if (result.affected === 0) {
      throw new NotFoundException('气球记录不存在或已送达');
    }
  }

  // ─── 私有方法 ─────────────────────────────────────────────────────────────────

  private async addProblems(
    contestId: number,
    problemIds: number[],
  ): Promise<void> {
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < problemIds.length; i++) {
      await this.contestProblemRepo.save(
        this.contestProblemRepo.create({
          contestId,
          problemId: problemIds[i],
          label: labels[i] ?? null,
          weight: 1,
        }),
      );
    }
  }

  /**
   * 添加单道题目到竞赛（管理员操作）
   */
  async addProblem(contestId: number, problemId: number): Promise<ContestProblem> {
    const contest = await this.contestRepo.findOne({ where: { id: contestId } });
    if (!contest) throw new NotFoundException(`竞赛 #${contestId} 不存在`);

    // 获取当前题目数确定 label
    const existing = await this.contestProblemRepo.find({ where: { contestId } });
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const label = labels[existing.length] ?? null;

    // 检查是否已存在
    const dup = existing.find((p) => p.problemId === problemId);
    if (dup) return dup;

    return this.contestProblemRepo.save(
      this.contestProblemRepo.create({ contestId, problemId, label, weight: 1 }),
    );
  }

  /**
   * 从竞赛移除题目
   */
  async removeProblem(contestId: number, problemId: number): Promise<void> {
    const cp = await this.contestProblemRepo.findOne({ where: { contestId, problemId } });
    if (!cp) throw new NotFoundException(`竞赛题目不存在`);
    await this.contestProblemRepo.remove(cp);
  }
}
