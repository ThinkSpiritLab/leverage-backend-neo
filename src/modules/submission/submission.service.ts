import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import archiver from 'archiver';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { Problem } from '../../database/entities/problem.entity';
import { RejudgeLog } from '../../database/entities/rejudge-log.entity';
import { Suspicion } from '../../database/entities/suspicion.entity';
import { RedisService } from '../redis/redis.service';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { Status } from '../heng/heng.types';
import {
  LANGUAGE_BONUS,
  MAX_MEMORY_LIMIT,
} from '../../common/constants/submission.constants';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { SearchSubmissionDto } from './dto/search-submission.dto';
import { RejudgeDto } from './dto/rejudge.dto';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { SUBMISSION_TOTAL_COUNTER } from '../metrics/metrics.module';
import { BotzoneClientService } from '../botzone/botzone-client.service';
import {
  InlineTestcase,
  JudgeProviderName,
} from '../judge-provider/judge-provider.interface';

const TEST_CASES_PATH = process.env.TEST_CASES_PATH ?? '/tmp/testcases';

export enum UserProblemStatus {
  TODO = 0,
  ATTEMPTED = 1,
  ACCEPTED = 2,
  PENDING = 3,
}

const LANGUAGE_NAME_MAP: Record<number, string> = {
  6: 'java',
  7: 'kotlin',
  8: 'python2',
  9: 'python3',
  10: 'javascript',
  11: 'typescript',
};

const LANGUAGE_EXT_MAP: Record<number, string> = {
  0: 'c',
  1: 'cpp',
  2: 'cpp',
  3: 'cpp',
  4: 'pas',
  5: 'c',
  6: 'java',
  7: 'kt',
  8: 'py',
  9: 'py',
  10: 'js',
  11: 'ts',
};

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(SubmissionMisc)
    private readonly miscRepo: Repository<SubmissionMisc>,
    @InjectRepository(Problem)
    private readonly problemRepo: Repository<Problem>,
    @InjectRepository(RejudgeLog)
    private readonly rejudgeLogRepo: Repository<RejudgeLog>,
    @InjectRepository(Suspicion)
    private readonly suspicionRepo: Repository<Suspicion>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectQueue(JUDGE_TX_QUEUE)
    private readonly judgeTxQueue: Queue,
    @InjectMetric(SUBMISSION_TOTAL_COUNTER)
    private readonly submissionCounter: Counter<string>,
    @Optional()
    private readonly botzoneClient: BotzoneClientService | null,
  ) {}

  async create(userId: number, dto: CreateSubmissionDto): Promise<Submission> {
    await this.checkRateLimit(userId);
    const problem = await this.problemRepo.findOne({
      where: { id: dto.problemId },
      cache: 6000,
    });
    if (!problem) throw new NotFoundException(`题目 #${dto.problemId} 不存在`);
    const { timeLimit, memoryLimit } = this.applyLanguageBonus(
      problem,
      dto.language,
    );

    // Determine which judge provider to use
    const botzoneEnabled = this.configService.get<boolean>(
      'botzone.enabled',
      false,
    );
    const usesBotzone =
      botzoneEnabled &&
      this.botzoneClient !== null;

    const submission = await this.submissionRepo.save({
      userId,
      problemId: dto.problemId,
      language: dto.language,
      status: Status.PENDING,
      contestId: dto.contestId ?? null,
      courseId: dto.courseId ?? null,
      provider: usesBotzone ? JudgeProviderName.Botzone : null,
    });
    await this.miscRepo.save({ submissionId: submission.id, code: dto.code });

    if (usesBotzone) {
      await this.enqueueToBottzone(submission, problem, dto, timeLimit, memoryLimit);
    } else {
      await this.judgeTxQueue.add('judge', {
        submissionId: submission.id,
        task: {
          language: dto.language,
          code: dto.code,
          timeLimit,
          memoryLimit,
          testDataUrl: this.buildTestDataUrl(problem),
        },
      });
    }

    // Increment business metric counter
    const langName = LANGUAGE_EXT_MAP[dto.language] ?? String(dto.language);
    this.submissionCounter
      .labels({ language: langName, status: 'pending' })
      .inc();

    this.logger.log(
      `Submission created: id=${submission.id}, userId=${userId}, problemId=${dto.problemId}, provider=${usesBotzone ? 'botzone' : 'heng'}`,
    );
    return submission;
  }

  /**
   * 从磁盘读取题目的内联测试用例（botzone-neo OJ 模式所需）
   */
  private async readTestcases(problem: Problem): Promise<InlineTestcase[]> {
    const dir = path.join(
      TEST_CASES_PATH,
      problem.prefix,
      problem.logicId.toString(),
    );
    const testcases: InlineTestcase[] = [];
    for (let i = 1; i <= (problem.cases ?? 0); i++) {
      try {
        const input = await fs.readFile(path.join(dir, `${i}.in`), 'utf-8');
        const expectedOutput = await fs.readFile(
          path.join(dir, `${i}.out`),
          'utf-8',
        );
        testcases.push({ id: i, input, expectedOutput });
      } catch {
        this.logger.warn(
          `测试用例文件缺失: problem=${problem.id} case=${i}`,
        );
      }
    }
    return testcases;
  }

  /**
   * 加载题目的 checker 信息（checkerCode 有 select:false，需要单独查询）
   */
  private async loadCheckerInfo(
    problemId: number,
  ): Promise<{ checkerCode?: string; checkerLanguage?: string }> {
    const row = await this.problemRepo
      .createQueryBuilder('p')
      .select(['p.checkerLanguage', 'p.checkerCode'])
      .addSelect('p.checkerCode') // 强制加载 select:false 列
      .where('p.id = :id', { id: problemId })
      .getRawOne<{ p_checkerCode?: string; p_checkerLanguage?: string }>();
    return {
      checkerCode: row?.p_checkerCode ?? undefined,
      checkerLanguage: row?.p_checkerLanguage ?? undefined,
    };
  }

  /**
   * Enqueue a submission to botzone-neo and persist the external job ID.
   */
  private async enqueueToBottzone(
    submission: Submission,
    problem: Problem,
    dto: CreateSubmissionDto,
    timeLimit: number,
    memoryLimit: number,
  ): Promise<void> {
    try {
      // 读取内联测试用例（botzone-neo OJ API 需要）
      const testcases = await this.readTestcases(problem);

      // 加载 SPJ checker 信息（如有）
      const { checkerCode, checkerLanguage } =
        await this.loadCheckerInfo(problem.id);

      const result = await this.botzoneClient!.enqueue({
        submissionId: submission.id,
        language: dto.language,
        code: dto.code,
        timeLimit,
        memoryLimit,
        testDataUrl: this.buildTestDataUrl(problem),
        testcases,
        checkerCode,
        checkerLanguage,
      });

      // Persist externalJobId + providerMeta
      await this.submissionRepo.update(submission.id, {
        externalJobId: result.externalJobId,
        providerMeta: result.providerMeta
          ? JSON.stringify(result.providerMeta)
          : null,
      });

      this.logger.log(
        `Botzone enqueue success: submissionId=${submission.id}, externalJobId=${result.externalJobId}`,
      );
    } catch (err) {
      this.logger.error(
        `Botzone enqueue failed for submissionId=${submission.id}`,
        err,
      );
      // Mark as SE so it doesn't stay pending indefinitely
      await this.submissionRepo.update(submission.id, { status: Status.SE });
      throw err;
    }
  }

  async findAll(
    query: SubmissionQueryDto,
  ): Promise<{ items: Submission[]; total: number }> {
    const {
      page = 1,
      perPage = 20,
      userId,
      problemId,
      status,
      contestId,
      courseId,
    } = query;
    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.problem', 'problem')
      .leftJoinAndSelect('s.user', 'user')
      .take(perPage)
      .skip((page - 1) * perPage)
      .orderBy('s.id', 'DESC');
    if (userId !== undefined) qb.andWhere('s.userId = :userId', { userId });
    if (problemId !== undefined)
      qb.andWhere('s.problemId = :problemId', { problemId });
    if (status !== undefined) qb.andWhere('s.status = :status', { status });
    if (contestId !== undefined)
      qb.andWhere('s.contestId = :contestId', { contestId });
    if (courseId !== undefined)
      qb.andWhere('s.courseId = :courseId', { courseId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOne(id: number): Promise<Submission & { misc: SubmissionMisc }> {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['misc', 'problem', 'user'],
    });
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`);
    return submission as Submission & { misc: SubmissionMisc };
  }

  async rejudge(id: number): Promise<void> {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['problem'],
    });
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`);
    const misc = await this.miscRepo.findOne({ where: { submissionId: id } });
    if (!misc) throw new NotFoundException(`提交 #${id} 的代码不存在`);
    await this.rejudgeLogRepo.save({
      submissionId: id,
      status: submission.status,
      time: submission.time,
      memory: submission.memory,
      judger: submission.judger,
      judgeResult: misc.judgeResult,
      compileErrorMsg: misc.compileErrorMsg,
      submittedAt: submission.updatedAt,
    });
    await this.submissionRepo.update(id, {
      status: Status.PENDING,
      judger: null,
    });
    const { timeLimit, memoryLimit } = this.applyLanguageBonus(
      submission.problem,
      submission.language,
    );
    await this.judgeTxQueue.add('judge', {
      submissionId: submission.id,
      task: {
        language: submission.language,
        code: misc.code,
        timeLimit,
        memoryLimit,
        testDataUrl: this.buildTestDataUrl(submission.problem),
      },
    });
    this.logger.log(`Rejudge queued: submissionId=${id}`);
  }

  async getStatus(id: number): Promise<{ status: number }> {
    const cacheKey = `submission-status:${id}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) return { status: parseInt(cached, 10) };
    const submission = await this.submissionRepo.findOne({
      where: { id },
      select: ['id', 'status'],
    });
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`);
    return { status: submission.status };
  }

  async count(): Promise<number> {
    return this.submissionRepo.count({ cache: 5000 });
  }

  async getProblemRatio(
    problemId: number,
    courseId: number | null | false,
    contestId: number | null | false,
  ) {
    const q = this.submissionRepo
      .createQueryBuilder('s')
      .where('s.problemId = :problemId', { problemId })
      .select('count(*)', 'cnt')
      .addSelect('s.status', 'status')
      .groupBy('s.status');
    if (courseId !== false) {
      if (courseId) q.andWhere('s.courseId = :courseId', { courseId });
      else q.andWhere('s.courseId IS NULL');
    }
    if (contestId !== false) {
      if (contestId) q.andWhere('s.contestId = :contestId', { contestId });
      else q.andWhere('s.contestId IS NULL');
    }
    return q.cache(30 * 1000).getRawMany();
  }

  async search(
    showRestricted: boolean,
    courseId: number | null | false,
    contestId: number | null | false,
    dto: SearchSubmissionDto,
    page: number,
    perPage = 12,
  ): Promise<{ items: any[]; total: number }> {
    const { name, title, language, status, userId } = dto;
    const q = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoin('s.user', 'user')
      .leftJoin('s.problem', 'problem')
      .select('s.id', 'id')
      .addSelect('s.userId', 'userId')
      .addSelect('user.username', 'username')
      .addSelect('user.certifiedName', 'certifiedName')
      .addSelect('user.nickname', 'nickname')
      .addSelect('s.problemId', 'problemId')
      .addSelect('s.contestId', 'contestId')
      .addSelect('s.courseId', 'courseId')
      .addSelect('problem.title', 'title')
      .addSelect('problem.prefix', 'prefix')
      .addSelect('problem.logicId', 'logicId')
      .addSelect('s.status', 'status')
      .addSelect('s.createdAt', 'createdAt')
      .addSelect('s.time', 'time')
      .addSelect('s.memory', 'memory')
      .addSelect('s.language', 'language')
      .orderBy('s.id', 'DESC')
      .limit(perPage)
      .offset((page - 1) * perPage);
    if (userId) q.andWhere('s.userId = :userId', { userId });
    else if (name)
      q.andWhere(
        '(user.username LIKE :name OR user.certifiedName LIKE :name)',
        { name: `%${name}%` },
      );
    if (!showRestricted) {
      q.andWhere('problem.restricted = false').andWhere(
        'problem.closed = false',
      );
    }
    if (title) {
      const match = /^([A-Za-z]+)(\d+)?$/.exec(title);
      const [, prefix, problemId] = match || [];
      if (problemId && prefix) {
        q.andWhere(
          '(problem.prefix = :prefix AND problem.logicId = :pid OR problem.title LIKE :title)',
          { prefix: prefix.toLowerCase(), pid: problemId, title: `%${title}%` },
        );
      } else if (prefix && prefix.length === 1) {
        q.andWhere('problem.prefix = :prefix', {
          prefix: prefix.toLowerCase(),
        });
      } else if (prefix) {
        q.andWhere('(problem.prefix = :prefix OR problem.title LIKE :title)', {
          prefix: prefix.toLowerCase(),
          title: `%${title}%`,
        });
      } else {
        q.andWhere(
          '(problem.title LIKE :title OR problem.id = :pid OR problem.logicId = :pid)',
          { title: `%${title}%`, pid: title },
        );
      }
    }
    if (language !== undefined)
      q.andWhere('s.language = :language', { language });
    if (status !== undefined && status !== null)
      q.andWhere('s.status = :status', { status });
    if (courseId !== false) {
      if (courseId) q.andWhere('s.courseId = :courseId', { courseId });
      else q.andWhere('s.courseId IS NULL');
    }
    if (contestId !== false) {
      if (contestId) q.andWhere('s.contestId = :contestId', { contestId });
      else q.andWhere('s.contestId IS NULL');
    }
    if (page > 5) q.cache(10 * 60 * 1000);
    else q.cache(6000);
    const [items, total] = await Promise.all([q.getRawMany(), q.getCount()]);
    return { items, total };
  }

  async searchRejudgeLog(
    showRestricted: boolean,
    dto: SearchSubmissionDto,
    page: number,
    perPage = 12,
  ) {
    const { name, title, language, status, userId } = dto;
    const q = this.rejudgeLogRepo
      .createQueryBuilder('rl')
      .leftJoin('rl.submission', 's')
      .leftJoin('s.user', 'user')
      .leftJoin('s.problem', 'problem')
      .select('s.id', 'id')
      .addSelect('s.userId', 'userId')
      .addSelect('user.username', 'username')
      .addSelect('user.certifiedName', 'certifiedName')
      .addSelect('s.problemId', 'problemId')
      .addSelect('problem.title', 'title')
      .addSelect('problem.prefix', 'prefix')
      .addSelect('problem.logicId', 'logicId')
      .addSelect('s.status', 'newStatus')
      .addSelect('rl.status', 'originalStatus')
      .addSelect('rl.createdAt', 'createdAt')
      .addSelect('s.createdAt', 'submittedAt')
      .addSelect('s.time', 'newTime')
      .addSelect('s.memory', 'newMemory')
      .addSelect('rl.time', 'originalTime')
      .addSelect('rl.memory', 'originalMemory')
      .addSelect('s.language', 'language')
      .orderBy('rl.id', 'DESC')
      .limit(perPage)
      .offset((page - 1) * perPage);
    if (userId) q.andWhere('s.userId = :userId', { userId });
    else if (name)
      q.andWhere(
        '(user.username LIKE :name OR user.certifiedName LIKE :name)',
        { name: `%${name}%` },
      );
    if (!showRestricted) {
      q.andWhere('problem.restricted = false').andWhere(
        'problem.closed = false',
      );
    }
    if (title)
      q.andWhere('(problem.title LIKE :title OR problem.id LIKE :title)', {
        title: `%${title}%`,
      });
    if (language !== undefined)
      q.andWhere('s.language = :language', { language });
    if (status !== undefined && status !== null)
      q.andWhere('s.status = :status', { status });
    q.cache(6000);
    const [items, total] = await Promise.all([q.getRawMany(), q.getCount()]);
    return { items, total };
  }

  async batchRejudge(
    dto: RejudgeDto,
    countOnly = false,
  ): Promise<number | void> {
    const {
      contestId,
      courseId,
      userId,
      problemId,
      idStart,
      idEnd,
      dateStart,
      dateEnd,
      status,
    } = dto;
    const q = this.submissionRepo.createQueryBuilder('s');
    if (contestId === -1) q.andWhere('s.contestId IS NULL');
    else if (contestId !== undefined)
      q.andWhere('s.contestId = :contestId', { contestId });
    if (courseId === -1) q.andWhere('s.courseId IS NULL');
    else if (courseId !== undefined)
      q.andWhere('s.courseId = :courseId', { courseId });
    if (userId !== undefined) q.andWhere('s.userId = :userId', { userId });
    if (problemId) q.andWhere('s.problemId = :problemId', { problemId });
    if (status !== undefined && status !== null)
      q.andWhere('s.status = :status', { status });
    if (idStart !== undefined) q.andWhere('s.id >= :idStart', { idStart });
    if (idEnd !== undefined) q.andWhere('s.id <= :idEnd', { idEnd });
    if (dateStart !== undefined)
      q.andWhere('s.createdAt >= :dateStart', { dateStart });
    if (dateEnd !== undefined)
      q.andWhere('s.createdAt <= :dateEnd', { dateEnd });
    if (countOnly) return q.getCount();
    const ids = await q
      .select('s.id', 'id')
      .getRawMany<{ id: number }>()
      .then((rows) => rows.map((r) => r.id));
    (async () => {
      for (const id of ids) {
        try {
          await this.rejudge(id);
          this.logger.log(`Rejudge launched: ${id}`);
        } catch (err) {
          this.logger.error(`Rejudge failed for ${id}:`, err);
        }
      }
    })();
  }

  async getCodeZip(params: {
    contestId?: number;
    courseId?: number;
    userId?: number;
    problemId?: number;
    take?: number;
  }) {
    const { contestId, courseId, userId, problemId, take } = params;
    const q = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.misc', 'misc')
      .select([
        's.id',
        's.userId',
        's.problemId',
        's.language',
        's.status',
        'misc.code',
      ]);
    if (contestId !== undefined)
      q.andWhere('s.contestId = :contestId', { contestId });
    if (courseId !== undefined)
      q.andWhere('s.courseId = :courseId', { courseId });
    if (userId !== undefined) q.andWhere('s.userId = :userId', { userId });
    if (problemId !== undefined)
      q.andWhere('s.problemId = :problemId', { problemId });
    q.take(take ? Math.min(take, 100000) : 10000);
    const submissions = await q.getMany();
    const arc = archiver('zip');
    for (const s of submissions) {
      const ext = LANGUAGE_EXT_MAP[s.language] ?? 'txt';
      arc.append((s.misc as { code?: string } | null)?.code ?? '', {
        name: `${s.userId}-${s.problemId}-${s.id}-${s.status}.${ext}`,
      });
    }
    arc.finalize();
    return arc;
  }

  async getCE(id: number, userId: number, isAdmin: boolean) {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['user', 'problem', 'misc', 'contest', 'course'],
    });
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`);
    if (!isAdmin && submission.userId !== userId)
      throw new ForbiddenException('无权限查看此提交');
    const result = { ...submission };
    const misc = result.misc as Record<string, unknown> | null | undefined;
    if (misc) {
      delete misc.code;
      delete misc.judgeResult;
    }
    delete (result as { time?: unknown }).time;
    delete (result as { memory?: unknown }).memory;
    return result;
  }

  async inspect(id: number, userId: number, isAdmin: boolean) {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['misc'],
    });
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`);
    if (!isAdmin && submission.userId !== userId)
      throw new ForbiddenException('无权限查看此提交代码');
    return {
      id: submission.id,
      code: (submission.misc as { code?: string } | null)?.code,
    };
  }

  async remove(id: number) {
    const result = await this.submissionRepo.delete(id);
    if (!result.affected) throw new NotFoundException(`提交 #${id} 不存在`);
    return { deleted: true };
  }

  async getUserProblemStatus(
    userId: number,
    problemId: number,
    courseId: number | null,
    contestId: number | null,
  ): Promise<UserProblemStatus> {
    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.userId = :userId AND s.problemId = :problemId', {
        userId,
        problemId,
      });
    if (contestId !== null)
      qb.andWhere('s.contestId = :contestId', { contestId });
    else qb.andWhere('s.contestId IS NULL');
    if (courseId !== null) qb.andWhere('s.courseId = :courseId', { courseId });
    else qb.andWhere('s.courseId IS NULL');
    const acQb = qb
      .clone()
      .andWhere('s.status = :acStatus', { acStatus: Status.AC });
    if (await acQb.getCount()) return UserProblemStatus.ACCEPTED;
    const triedQb = qb.clone().andWhere('s.status NOT IN (:...exclude)', {
      exclude: [Status.AC, Status.PENDING, Status.JUDGING, Status.COMPILING],
    });
    return (await triedQb.getCount())
      ? UserProblemStatus.ATTEMPTED
      : UserProblemStatus.TODO;
  }

  async getUserProblemStatusBatch(
    userId: number,
    problemIds: number[],
    courseId: number | null,
    contestId: number | null,
  ): Promise<Record<number, UserProblemStatus>> {
    const result: Record<number, UserProblemStatus> = {};
    if (problemIds.length === 0) return result;

    const acQb = this.submissionRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.problemId', 'problemId')
      .where(
        's.userId = :userId AND s.status = :acStatus AND s.problemId IN (:...problemIds)',
        { userId, acStatus: Status.AC, problemIds },
      );
    // 指定了 contest/course 则限制范围，否则查全局（不过滤，任何来源的 AC 都算）
    if (contestId !== null)
      acQb.andWhere('s.contestId = :contestId', { contestId });
    if (courseId !== null)
      acQb.andWhere('s.courseId = :courseId', { courseId });

    const triedQb = this.submissionRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.problemId', 'problemId')
      .where('s.userId = :userId AND s.problemId IN (:...problemIds)', {
        userId,
        problemIds,
      })
      .andWhere('s.status NOT IN (:...exclude)', {
        exclude: [Status.AC, Status.PENDING, Status.JUDGING, Status.COMPILING],
      });
    if (contestId !== null)
      triedQb.andWhere('s.contestId = :contestId', { contestId });
    if (courseId !== null)
      triedQb.andWhere('s.courseId = :courseId', { courseId });

    const [acRows, triedRows] = await Promise.all([
      acQb.getRawMany<{ problemId: string }>(),
      triedQb.getRawMany<{ problemId: string }>(),
    ]);
    const acSet = new Set(acRows.map((r) => Number(r.problemId)));
    const triedSet = new Set(triedRows.map((r) => Number(r.problemId)));
    for (const pid of problemIds) {
      if (acSet.has(pid)) result[pid] = UserProblemStatus.ACCEPTED;
      else if (triedSet.has(pid)) result[pid] = UserProblemStatus.ATTEMPTED;
      else result[pid] = UserProblemStatus.TODO;
    }
    return result;
  }

  async getSusList(hashsum: string) {
    return this.suspicionRepo
      .createQueryBuilder('ss')
      .leftJoin('ss.submission', 's')
      .leftJoin('s.problem', 'p')
      .leftJoin('s.user', 'u')
      .where('ss.hashsum = :hashsum', { hashsum })
      .orderBy('s.userId', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .select([
        'u.id',
        'u.username',
        'u.certifiedName',
        'p.logicId',
        'p.prefix',
        'p.title',
        's.id',
        's.createdAt',
        'ss.hashsum',
        'ss.submissionId',
      ])
      .getRawMany();
  }

  async getSusUnion(...userIds: number[]) {
    if (userIds.length === 0) return [];
    const hashes: string[] = await this.suspicionRepo
      .createQueryBuilder('ss')
      .leftJoin('ss.submission', 's')
      .where('s.userId IN (:...userIds)', { userIds })
      .select('ss.hashsum', 'hashsum')
      .groupBy('ss.hashsum')
      .having('COUNT(DISTINCT s.userId) >= :length', { length: userIds.length })
      .getRawMany<{ hashsum: string }>()
      .then((rows) => rows.map((r) => r.hashsum));
    if (hashes.length === 0) return [];
    return this.suspicionRepo
      .createQueryBuilder('ss')
      .leftJoin('ss.submission', 's')
      .leftJoin('s.problem', 'p')
      .leftJoin('s.user', 'u')
      .where('ss.hashsum IN (:...hashes)', { hashes })
      .andWhere('s.userId IN (:...userIds)', { userIds })
      .orderBy('s.problemId', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .select([
        'u.username',
        'u.certifiedName',
        'p.logicId',
        'p.prefix',
        'p.title',
        's.id',
        's.createdAt',
        'ss.hashsum',
        'ss.submissionId',
      ])
      .getRawMany();
  }

  async getRecentSus() {
    return this.suspicionRepo
      .createQueryBuilder('ss')
      .leftJoin('ss.submission', 's')
      .leftJoin('s.problem', 'p')
      .leftJoin('s.user', 'u')
      .where('ss.checked = false')
      .limit(12)
      .select([
        'u.username',
        'u.certifiedName',
        'p.logicId',
        'p.prefix',
        'p.title',
        's.id',
        's.createdAt',
        'ss.hashsum',
        'ss.checked',
        'ss.submissionId',
      ])
      .addSelect(
        'ss.mas0 + ss.md1 + ss.def + ss.con + ss.cpp + ss.oo + ss.cr + ss.html + ss.chn + ss.qq',
        'sum',
      )
      .orderBy('sum', 'DESC')
      .getRawMany();
  }

  async getSusXlsx(
    contestId?: number,
    courseId?: number,
    problemId?: number,
    userId?: number,
    limit?: number,
  ): Promise<Buffer> {
    const q = this.suspicionRepo
      .createQueryBuilder('ss')
      .leftJoin('ss.submission', 's')
      .select('ss.submissionId', 'submissionId')
      .addSelect('s.problemId', 'problemId')
      .addSelect('s.userId', 'userId')
      .addSelect('ss.hashsum', 'hashsum')
      .addSelect('ss.mas0', 'mas0')
      .addSelect('ss.md1', 'md1')
      .addSelect('ss.def', 'def')
      .addSelect('ss.con', 'con')
      .addSelect('ss.cpp', 'cpp')
      .addSelect('ss.oo', 'oo')
      .addSelect('ss.cr', 'cr')
      .addSelect('ss.html', 'html')
      .addSelect('ss.chn', 'chn')
      .addSelect('ss.qq', 'qq')
      .addSelect('ss.checked', 'checked')
      .take(Math.min(limit ?? 10000, 100000));
    if (contestId !== undefined)
      q.andWhere('s.contestId = :contestId', { contestId });
    if (courseId !== undefined)
      q.andWhere('s.courseId = :courseId', { courseId });
    if (problemId !== undefined)
      q.andWhere('s.problemId = :problemId', { problemId });
    if (userId !== undefined) q.andWhere('s.userId = :userId', { userId });
    const rows = await q.getRawMany<Record<string, unknown>>();
    const headers =
      rows.length > 0
        ? Object.keys(rows[0])
        : ['submissionId', 'problemId', 'userId', 'hashsum'];
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => JSON.stringify(row[h] ?? '')).join(','),
      ),
    ];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  async checkSus(submissionId: number): Promise<Suspicion | null> {
    const sus = await this.suspicionRepo.findOne({ where: { submissionId } });
    if (!sus) return null;
    sus.checked = !sus.checked;
    return this.suspicionRepo.save(sus);
  }

  susTest(code: string): Record<string, unknown> {
    return SubmissionService.checkSuspicion(code);
  }

  static checkSuspicion(source: string): Record<string, unknown> {
    source = source
      .replace(/\/\/.*/g, '')
      .replace(/\s+/g, '')
      .replace(/\/\*(.*?)\*\//g, '')
      .replace(/"(.*?)"/g, '');
    const hashsum = createHash('sha1').update(source).digest('hex');
    const occ = (pattern: RegExp) => (source.match(pattern) || []).length;
    const mas0 = occ(/[*+-]0\b/g);
    const md1 = occ(/[/*]1[^.\d]/g) * 3;
    const defCnt = occ(/#define/g);
    const def = Math.min(Math.round(1.4 ** defCnt - 1), 2000);
    const con = occ(/[+\-*^%&|]\d+[+\-*^%&|]\d+/g);
    const cpp = Math.round(
      occ(
        /virtual|nullptr|constexpr|typename|template|friend|decltype|override|explicit|mutable|volatile/g,
      ) * 1.5,
    );
    const oo = Math.round(occ(/class|public|private|protected/g) * 0.75);
    const cr = occ(/https|http|csdn/gi) * 100;
    const html = occ(/<\s*\w+[^>]*>(.*?)<\s*\/\s*\w+>/g) * 100;
    const chn = occ(/[\u4e00-\u9fa5]/g) * 3;
    const qq = occ(/\d{2}:\d{2}:\d{2}/g) * 300;
    return { hashsum, mas0, md1, def, con, cpp, oo, cr, html, chn, qq };
  }

  private async checkRateLimit(userId: number): Promise<void> {
    const key = `submit-throttle:${userId}`;
    const count = await this.redisService.incr(key);
    if (count === 1) await this.redisService.expire(key, 60);
    const max = this.configService.get<number>('submission.maxPerMinute', 10);
    if (count > max)
      throw new HttpException(
        '提交过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  applyLanguageBonus(
    problem: Problem,
    language: number,
  ): { timeLimit: number; memoryLimit: number } {
    const languageName = LANGUAGE_NAME_MAP[language];
    const bonus = languageName ? LANGUAGE_BONUS[languageName] : undefined;
    let { timeLimit, memoryLimit } = problem;
    if (bonus) {
      timeLimit = timeLimit * bonus.timeMultiplier;
      memoryLimit = memoryLimit * bonus.memoryMultiplier;
      if (bonus.minMemory !== undefined)
        memoryLimit = Math.max(memoryLimit, bonus.minMemory / (1024 * 1024));
      memoryLimit = Math.min(memoryLimit, MAX_MEMORY_LIMIT / (1024 * 1024));
    }
    return { timeLimit, memoryLimit };
  }

  private buildTestDataUrl(problem: Problem): string {
    const baseUrl = this.configService.get<string>(
      'baseUrl',
      'http://localhost:3000',
    );
    return `${baseUrl}/problems/${problem.id}/test-data`;
  }

  /**
   * 导出提交记录 CSV（按过滤条件，最多 5000 条）
   */
  async exportCsv(query: SubmissionQueryDto): Promise<Buffer> {
    const STATUS_TEXT: Record<number, string> = {
      0: 'AC', 1: 'WA', 2: 'TLE', 3: 'MLE', 4: 'CE',
      5: 'SE', 6: 'RE', 7: 'PE', 8: 'CRLE',
      9: 'PENDING', 10: 'JUDGING', 11: 'COMPILING', 12: 'OLE', 13: 'SC',
    };
    const LANG_TEXT: Record<number, string> = {
      0: 'C', 1: 'C++', 6: 'Java', 8: 'Python2', 9: 'Python3', 10: 'JS', 11: 'TS',
    };

    const { userId, problemId, status, contestId, courseId } = query;
    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.problem', 'problem')
      .leftJoinAndSelect('s.user', 'user')
      .take(5000)
      .orderBy('s.id', 'DESC');
    if (userId !== undefined) qb.andWhere('s.userId = :userId', { userId });
    if (problemId !== undefined) qb.andWhere('s.problemId = :problemId', { problemId });
    if (status !== undefined) qb.andWhere('s.status = :status', { status });
    if (contestId !== undefined) qb.andWhere('s.contestId = :contestId', { contestId });
    if (courseId !== undefined) qb.andWhere('s.courseId = :courseId', { courseId });

    const items = await qb.getMany();

    const bom = '\uFEFF';
    const header = '提交ID,用户名,题号,语言,状态,时间(ms),内存(KB),提交时间\n';
    const rows = items.map((s) => {
      const problem = s.problem as any;
      const user = s.user as any;
      return [
        s.id,
        user?.username ?? s.userId,
        problem ? `${problem.prefix ?? ''}${problem.logicId ?? ''}` : s.problemId,
        LANG_TEXT[s.language] ?? s.language,
        STATUS_TEXT[s.status] ?? s.status,
        s.time ?? '',
        s.memory != null ? Math.round(s.memory / 1024) : '',
        s.createdAt ? new Date(s.createdAt).toISOString().replace('T', ' ').slice(0, 19) : '',
      ].join(',');
    });

    return Buffer.from(bom + header + rows.join('\n'), 'utf-8');
  }
}
