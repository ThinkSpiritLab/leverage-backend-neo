import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

// ── ICPC 榜单类型 ────────────────────────────────────────────────────────────
export interface IcpcProblemStat {
  problemId: number;
  label: string;
  /** null = 未尝试 */
  acTime: number | null;  // 分钟（从比赛开始）
  attempts: number;       // WA 次数（不含最终 AC）
  frozen: boolean;        // 该题最新提交是否在冻榜期内（显示 ?）
}

export interface IcpcRankRow {
  rank: number;
  userId: number;
  username: string;
  certifiedName: string | null;
  room: string | null;
  seat: string | null;
  solved: number;
  totalPenalty: number; // 分钟（每道 AC 题：acTime + wa*penalty）
  problems: Record<string, IcpcProblemStat>; // key = problemId
}
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
  solved: number;
  penaltyMin: number;
  accepts: number;
  submits: number;
}

export interface ContestImportCredential {
  username: string;
  password: string;
}

export interface ContestImportResult {
  users: ContestUser[];
  credentials: ContestImportCredential[];
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
    private readonly dataSource: DataSource,
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

    // 附带每个竞赛的题目数
    if (items.length > 0) {
      const ids = items.map((c) => c.id);
      const counts: { contestId: number; cnt: string }[] =
        await this.contestRepo.manager.query(
          `SELECT contestId, COUNT(*) as cnt FROM contest_problem WHERE contestId IN (${ids.map(() => '?').join(',')}) GROUP BY contestId`,
          ids,
        );
      const countMap = new Map(counts.map((r) => [r.contestId, parseInt(r.cnt)]));
      for (const item of items) {
        (item as any).problemCount = countMap.get(item.id) ?? 0;
      }
    }

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
      .addSelect(['p.title', 'p.logicId', 'p.prefix'])
      .where('cp.contestId = :id', { id })
      .orderBy('cp.label', 'ASC')
      .getRawAndEntities();

    const enriched = problems.entities.map((cp, i) => ({
      ...cp,
      title: problems.raw[i]?.p_title ?? undefined,
      logicId: problems.raw[i]?.p_logicId ?? undefined,
      prefix: problems.raw[i]?.p_prefix ?? undefined,
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

  async isUserRegistered(contestId: number, userId: number): Promise<boolean> {
    const count = await this.contestUserRepo.count({ where: { contestId, userId } });
    return count > 0;
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
  ): Promise<ContestImportResult> {
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
    });
    if (!contest) throw new NotFoundException(`竞赛 ${contestId} 不存在`);

    const result: ContestUser[] = [];
    const credentials: ContestImportCredential[] = [];

    for (const u of users) {
      try {
        const existing = await this.contestUserRepo.findOne({
          where: { contestId, userId: u.userId },
        });

        const user = await this.userRepo.findOne({ where: { id: u.userId } });
        if (!user) {
          this.logger.warn(`importContestUsers skipped missing userId ${u.userId}`);
          continue;
        }

        const password = u.password ?? randomBytes(4).toString('hex');

        if (existing) {
          // 更新信息
          Object.assign(existing, {
            seat: u.seat ?? existing.seat,
            room: u.room ?? existing.room,
            wildcard: u.wildcard ?? existing.wildcard,
            female: u.female ?? existing.female,
            passwordHash: hashPassword(password),
          });
          result.push(await this.contestUserRepo.save(existing));
        } else {
          // 新建
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

        credentials.push({ username: user.username, password });
      } catch (err) {
        this.logger.warn(
          `importContestUsers error for userId ${u.userId}: ${err.message}`,
        );
      }
    }

    return { users: result, credentials };
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
      // 解码 Redis score：acCount * 1e9 - penaltySeconds
      const encodedScore = scoreRaw ? parseFloat(scoreRaw) : 0;
      // DB counters are authoritative; flooring a score reduced by a penalty
      // incorrectly subtracts one solved problem (and can even produce -1).
      const solved = cu?.accepts ?? Math.max(0, Math.ceil(encodedScore / 1_000_000_000));
      const penaltySec = cu
        ? Math.max(0, (cu.submits - cu.accepts) * 1200)
        : Math.max(0, solved * 1_000_000_000 - encodedScore);
      const penaltyMin = Math.round(penaltySec / 60);

      return {
        rank: start + index + 1,
        userId,
        username: user?.username ?? String(userId),
        certifiedName: user?.certifiedName ?? null,
        solved,
        penaltyMin,
        accepts: cu?.accepts ?? 0,
        submits: cu?.submits ?? 0,
      };
    });
  }

  /**
   * 获取气球列表（ContestUserProblem 首次 AC 记录，sent=false）
   */
  async getBalloons(contestId: number): Promise<any[]> {
    const balloons = await this.contestUserProblemRepo
      .createQueryBuilder('cup')
      .leftJoinAndSelect('cup.contestUser', 'cu')
      .leftJoinAndSelect('cu.user', 'user')
      .leftJoinAndSelect('cup.contestProblem', 'cp')
      .where('cup.contestUserContestId = :contestId', { contestId })
      .andWhere('cup.sent = false')
      .orderBy('cup.createdAt', 'ASC')
      .getMany();

    return balloons.map((cup) => ({
      id: cup.contestProblemId,
      contestProblemId: cup.contestProblemId,
      userId: cup.contestUser?.userId,
      username: cup.contestUser?.user?.username,
      problemLabel: cup.contestProblem?.label,
      problemId: cup.contestProblem?.problemId,
      sent: cup.sent,
      delivered: cup.sent,
      createdAt: cup.createdAt,
    }));
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

  async exportIcpcCsv(contestId: number): Promise<Buffer> {
    const rows = await this.icpcRanking(contestId);
    const contest = await this.findOne(contestId);
    const cpRows = [...(contest.problems ?? [])].sort((a, b) => {
      const aLabel = a.label ?? '';
      const bLabel = b.label ?? '';
      return aLabel.localeCompare(bLabel);
    });

    const headers = ['排名', '用户名', '姓名', 'AC数', '罚时'];
    for (const cp of cpRows) {
      const label = cp.label ?? String(cp.problemId);
      headers.push(`题${label} AC时间`, `题${label} WA次数`);
    }

    const lines: string[] = [headers.join(',')];
    for (const row of rows) {
      const cols: Array<string | number> = [
        row.rank,
        row.username,
        row.certifiedName ?? '',
        row.solved,
        row.totalPenalty,
      ];

      for (const cp of cpRows) {
        const stat = row.problems[cp.problemId];
        cols.push(stat?.acTime === null || stat?.acTime === undefined ? '' : Math.round(stat.acTime));
        cols.push(stat?.attempts ?? 0);
      }

      lines.push(cols.map((value) => this.escapeCsv(value)).join(','));
    }

    return Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
  }

  async exportContestUsersCsv(contestId: number): Promise<Buffer> {
    const contestUsers = await this.contestUserRepo.find({
      where: { contestId },
      relations: ['user'],
      order: { userId: 'ASC' },
    });

    const lines: string[] = ['用户名,姓名,座位,房间'];
    for (const contestUser of contestUsers) {
      const username = contestUser.user?.username ?? String(contestUser.userId);
      const name = contestUser.user?.certifiedName ?? '';
      const seat = contestUser.seat ?? '';
      const room = contestUser.room ?? '';
      lines.push([username, name, seat, room].map((value) => this.escapeCsv(value)).join(','));
    }

    return Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
  }

  // ─── 私有方法 ─────────────────────────────────────────────────────────────────

  private escapeCsv(value: string | number): string {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

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

  /**
   * 更新竞赛题目属性（颜色、分值、标签）
   */
  async updateProblem(
    contestId: number,
    problemId: number,
    dto: { color?: string | null; weight?: number; label?: string },
  ): Promise<ContestProblem> {
    const cp = await this.contestProblemRepo.findOne({ where: { contestId, problemId } });
    if (!cp) throw new NotFoundException(`竞赛题目不存在`);
    if (dto.color !== undefined) cp.color = dto.color ?? null;
    if (dto.weight !== undefined) cp.weight = dto.weight;
    if (dto.label !== undefined) cp.label = dto.label;
    return this.contestProblemRepo.save(cp);
  }

  /**
   * ICPC 式榜单
   * - 从 submission 表实时计算（无需预先 Redis 写入）
   * - 支持冻榜：冻榜期内的提交显示 ?，不影响排名
   */
  async icpcRanking(contestId: number): Promise<IcpcRankRow[]> {
    const contest = await this.findOne(contestId);
    const startMs = new Date(contest.startTime).getTime();
    const endMs   = new Date(contest.endTime).getTime();
    const penaltyMin: number = (contest as any).penalty ?? 20;

    // 冻榜：freezeTime 分钟前开始冻结（0 = 不冻）
    const freezeMin: number = (contest as any).freezeTime ?? 0;
    const freezeMs = freezeMin > 0 ? endMs - freezeMin * 60_000 : Infinity;

    // 获取该竞赛题目（label 信息）
    const cpRows = await this.contestProblemRepo.find({ where: { contestId } });
    const labelMap = new Map(cpRows.map((cp) => [cp.problemId, cp.label ?? '']));
    const problemIds = cpRows.map((cp) => cp.problemId);

    if (problemIds.length === 0) return [];

    // 查竞赛所有提交（在比赛时间内，status ∈ 全部）
    const subs: { userId: number; problemId: number; status: number; createdAt: Date }[] =
      await this.dataSource.query(
        `SELECT userId, problemId, status, createdAt
         FROM submission
         WHERE contestId = ?
           AND createdAt >= ? AND createdAt <= ?
         ORDER BY createdAt ASC`,
        [contestId, contest.startTime, contest.endTime],
      );

    // 获取该竞赛参赛用户
    const cuRows = await this.contestUserRepo.find({
      where: { contestId },
      relations: ['user'],
    });
    const userMap = new Map(cuRows.map((cu) => [cu.userId, cu]));

    // 按 userId 分组并计算每题状态
    // key = `${userId}-${problemId}`
    type Acc = {
      waCount: number;
      acTime: number | null;
      frozen: boolean;
    };
    const acc = new Map<string, Acc>();

    for (const sub of subs) {
      if (!problemIds.includes(sub.problemId)) continue;
      if (!userMap.has(sub.userId)) continue;

      const key = `${sub.userId}-${sub.problemId}`;
      let state = acc.get(key);
      if (!state) {
        state = { waCount: 0, acTime: null, frozen: false };
        acc.set(key, state);
      }

      // 已经 AC 了不再处理
      if (state.acTime !== null) continue;

      const subMs = new Date(sub.createdAt).getTime();
      const elapsedMin = (subMs - startMs) / 60_000;
      const inFreeze = subMs >= freezeMs;

      if (sub.status === 0) {
        // AC
        if (inFreeze) {
          state.frozen = true;
          // 冻榜期内不确认 AC，标记 frozen
        } else {
          state.acTime = elapsedMin;
        }
      } else if ([1, 2, 3, 4, 6, 8].includes(sub.status)) {
        // WA/TLE/MLE/CE/RE/CRLE
        if (!inFreeze) {
          state.waCount++;
        } else {
          state.frozen = true;
        }
      }
    }

    // 构建 rows
    const rows: IcpcRankRow[] = [];
    for (const [userId, cu] of userMap) {
      const problems: Record<string, IcpcProblemStat> = {};
      let solved = 0;
      let totalPenalty = 0;

      for (const pid of problemIds) {
        const key = `${userId}-${pid}`;
        const state = acc.get(key);
        const label = labelMap.get(pid) ?? '';

        if (!state) {
          problems[pid] = { problemId: pid, label, acTime: null, attempts: 0, frozen: false };
          continue;
        }

        const stat: IcpcProblemStat = {
          problemId: pid,
          label,
          acTime: state.acTime,
          attempts: state.waCount,
          frozen: state.frozen,
        };
        problems[pid] = stat;

        if (state.acTime !== null) {
          solved++;
          totalPenalty += Math.round(state.acTime) + state.waCount * penaltyMin;
        }
      }

      const u = cu.user;
      rows.push({
        rank: 0,
        userId,
        username: u?.username ?? String(userId),
        certifiedName: u?.certifiedName ?? null,
        room: cu.room ?? null,
        seat: cu.seat ?? null,
        solved,
        totalPenalty,
        problems,
      });
    }

    // 排序：AC 多 > 罚时少（冻榜用户不改变已确认位置）
    rows.sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      return a.totalPenalty - b.totalPenalty;
    });

    // 赋 rank
    rows.forEach((r, i) => { r.rank = i + 1; });

    return rows;
  }
}
