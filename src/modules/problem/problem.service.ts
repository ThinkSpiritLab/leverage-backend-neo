import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { ensureDir, writeFile } from 'fs-extra';
import { Parser as XmlParser } from 'xml2js';
import TurndownService from 'turndown';
import decode from 'decode-html';
import { Problem } from '../../database/entities/problem.entity';
import { Tag } from '../../database/entities/tag.entity';
import { ContestProblem } from '../../database/entities/contest-problem.entity';
import { CourseProblem } from '../../database/entities/course-problem.entity';
import { Submission } from '../../database/entities/submission.entity';
import { CacheService } from '../redis/cache.service';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { ProblemQueryDto } from './dto/problem-query.dto';
import { ZipHashDto } from './dto/zip-hash.dto';
import { DataSource } from 'typeorm';

/** FPS XML raw types */
interface FPSImage {
  src: string[];
  base64: string[];
}

interface FPSProblem {
  title: string[];
  time_limit: string[];
  memory_limit: string[];
  description: string[];
  input?: string[];
  output?: string[];
  sample_input: string[];
  sample_output: string[];
  test_input?: string[];
  test_output?: string[];
  hint?: string[];
  source: string[];
  spj?: unknown[];
  img?: FPSImage[];
}

interface FPSRawObject {
  fps: {
    item: FPSProblem[];
  };
}

const TEST_CASES_PATH = process.env.TEST_CASES_PATH ?? '/tmp/testcases';

@Injectable()
export class ProblemService {
  constructor(
    @InjectRepository(Problem)
    private readonly problemRepo: Repository<Problem>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    @InjectRepository(ContestProblem)
    private readonly contestProblemRepo: Repository<ContestProblem>,
    @InjectRepository(CourseProblem)
    private readonly courseProblemRepo: Repository<CourseProblem>,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // Existing methods
  // ─────────────────────────────────────────────────────────────────────

  /**
   * 列表（分页 + tag 过滤 + 权限过滤）
   * 非 admin 不返回 closed=true 或 restricted=true 的题目
   */
  async findAll(
    query: ProblemQueryDto,
    isAdmin: boolean,
  ): Promise<{ items: Problem[]; total: number }> {
    const { page = 1, perPage = 20, search, tagId } = query;
    // 合并 tagId（单数）和 tagIds（复数）
    const tagIds = [
      ...(query.tagIds ?? []),
      ...(tagId ? [tagId] : []),
    ];
    const skip = (page - 1) * perPage;

    const qb = this.problemRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tags')
      .take(perPage)
      .skip(skip)
      .orderBy('p.id', 'DESC');

    if (!isAdmin) {
      qb.andWhere('p.closed = :closed', { closed: false });
      qb.andWhere('p.restricted = :restricted', { restricted: false });
    }

    if (tagIds && tagIds.length > 0) {
      qb.andWhere('tags.id IN (:...tagIds)', { tagIds });
    }

    if (search) {
      const match = /^([A-Za-z]+)(\d+)?$/.exec(search);
      if (match) {
        const [, prefix, logicId] = match;
        if (logicId && prefix) {
          qb.andWhere(
            '(p.prefix = :prefix AND p.logicId = :logicId OR p.title LIKE :title)',
            {
              prefix: prefix.toLowerCase(),
              logicId: parseInt(logicId),
              title: `%${search}%`,
            },
          );
        } else {
          qb.andWhere('(p.prefix = :prefix OR p.title LIKE :title)', {
            prefix: prefix.toLowerCase(),
            title: `%${search}%`,
          });
        }
      } else {
        qb.andWhere('(p.title LIKE :title OR p.id = :id OR p.logicId = :id)', {
          title: `%${search}%`,
          id: parseInt(search) || -1,
        });
      }
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * 详情（缓存 6s）
   * 非 admin 不返回 closed/restricted 的题目
   */
  async findOne(id: number, isAdmin: boolean): Promise<Problem> {
    const cacheKey = `problem:${id}:${isAdmin ? 'admin' : 'user'}`;
    const cached = await this.cacheService.get<Problem>(cacheKey);
    if (cached) return cached;

    const qb = this.problemRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tags')
      .where('p.id = :id', { id });

    if (!isAdmin) {
      qb.andWhere('p.closed = :closed', { closed: false });
      qb.andWhere('p.restricted = :restricted', { restricted: false });
    }

    const problem = await qb.getOne();
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    await this.cacheService.set(cacheKey, problem, 6);
    return problem;
  }

  /**
   * 创建题目
   */
  async create(dto: CreateProblemDto): Promise<Problem> {
    const { tagIds, prefix = 'p', logicId, ...rest } = dto;

    const actualLogicId = logicId ?? (await this.getNextLogicId(prefix));

    const tags = tagIds?.length
      ? await this.tagRepo.findBy({ id: In(tagIds) })
      : [];

    const problem = this.problemRepo.create({
      ...rest,
      prefix: prefix.toLowerCase(),
      logicId: actualLogicId,
      tags,
    });

    return this.problemRepo.save(problem);
  }

  /**
   * 更新题目
   */
  async update(id: number, dto: UpdateProblemDto): Promise<Problem> {
    const problem = await this.problemRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    const { tagIds, ...rest } = dto;

    if (tagIds !== undefined) {
      problem.tags = tagIds.length
        ? await this.tagRepo.findBy({ id: In(tagIds) })
        : [];
    }

    Object.assign(problem, rest);
    const saved = await this.problemRepo.save(problem);

    await this.cacheService.del(`problem:${id}:admin`, `problem:${id}:user`);

    return saved;
  }

  /**
   * 删除题目
   */
  async remove(id: number): Promise<void> {
    const problem = await this.problemRepo.findOne({ where: { id } });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    await this.problemRepo.remove(problem);

    await this.cacheService.del(`problem:${id}:admin`, `problem:${id}:user`);
  }

  /**
   * Fork 题目：复制指定题目，自动分配同 prefix 下最小未使用的 logicId
   */
  async fork(id: number): Promise<Problem> {
    const src = await this.problemRepo.findOne({ where: { id }, relations: ['tags'] });
    if (!src) throw new NotFoundException(`题目 #${id} 不存在`);

    // 找到同 prefix 下最大 logicId，+1 作为新 logicId
    const maxRow = await this.problemRepo
      .createQueryBuilder('p')
      .where('p.prefix = :prefix', { prefix: src.prefix })
      .select('MAX(p.logicId)', 'maxId')
      .getRawOne() as { maxId: number | null };
    const newLogicId = (maxRow?.maxId ?? 0) + 1;

    const newProblem = this.problemRepo.create({
      prefix: src.prefix,
      logicId: newLogicId,
      title: `${src.title} (Fork)`,
      content: src.content,
      source: src.source,
      timeLimit: src.timeLimit,
      memoryLimit: src.memoryLimit,
      spjId: src.spjId,
      cases: src.cases,
      multiCases: src.multiCases,
      difficulty: src.difficulty,
      closed: true,          // fork 默认关闭（hidden），需手动开放
      restricted: src.restricted,
      tags: src.tags,
    });

    const saved = await this.problemRepo.save(newProblem);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  /**
   * 上传测试数据（校验必须是 zip）
   */
  async uploadTestData(id: number, file: Express.Multer.File): Promise<void> {
    this.validateZipFile(file);
    const problem = await this.problemRepo.findOne({ where: { id } });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);
    // TODO: 实际项目中此处调用 OSS/MinIO 上传服务
  }

  // ─────────────────────────────────────────────────────────────────────
  // New endpoint implementations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * GET /problems/next-id
   * 获取下一个可用 logicId（给定 prefix）
   */
  async getNextId(prefix: string): Promise<{ nextId: number }> {
    const nextId = await this.getNextLogicId(prefix.toLowerCase());
    return { nextId };
  }

  /**
   * GET /problems/logic
   * 按 prefix + logicId 查询题目
   */
  async getOneByLogicId(
    prefix: string,
    logicId: number,
    isAdmin: boolean,
  ): Promise<Problem> {
    const qb = this.problemRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tags')
      .where('p.prefix = :prefix', { prefix: prefix.toLowerCase() })
      .andWhere('p.logicId = :logicId', { logicId });

    if (!isAdmin) {
      qb.andWhere('p.closed = :closed', { closed: false });
      qb.andWhere('p.restricted = :restricted', { restricted: false });
    }

    const problem = await qb.getOne();
    if (!problem)
      throw new NotFoundException(
        `题目 ${prefix.toUpperCase()}${logicId} 不存在`,
      );
    return problem;
  }

  /**
   * GET /problems/digest-partial
   * 获取题目摘要列表（精简字段，用于选择器）
   */
  async digestPartial(
    page = 1,
    perPage = 12,
    tags: number[] = [],
    title?: string,
    isAdmin = false,
    todoOnly = false,
    userId?: number,
  ): Promise<[Problem[], number]> {
    const qb = this.problemRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tags')
      .select([
        'p.id',
        'p.title',
        'p.accepts',
        'p.submits',
        'p.prefix',
        'p.logicId',
        'p.status',
        'tags',
      ])
      .take(perPage)
      .skip((page - 1) * perPage)
      .cache(5000);

    if (!isAdmin) {
      qb.andWhere('p.closed = :closed', { closed: false });
      qb.andWhere('p.restricted = :restricted', { restricted: false });
    } else {
      qb.addSelect(['p.restricted', 'p.closed']);
    }

    if (tags.length > 0) {
      qb.andWhere('tags.id IN (:...tags)', { tags });
    }

    if (title) {
      const match = /^([A-Za-z]+)(\d+)?$/.exec(title);
      if (match) {
        const [, prefix, logicId] = match;
        if (logicId && prefix) {
          qb.andWhere(
            '(p.prefix = :prefix AND p.logicId = :lid OR p.title LIKE :t)',
            { prefix: prefix.toLowerCase(), lid: logicId, t: `%${title}%` },
          );
        } else if (prefix.length === 1) {
          qb.andWhere('p.prefix = :prefix', { prefix: prefix.toLowerCase() });
        } else {
          qb.andWhere('(p.prefix = :prefix OR p.title LIKE :t)', {
            prefix: prefix.toLowerCase(),
            t: `%${title}%`,
          });
        }
      } else {
        qb.andWhere('(p.title LIKE :t OR p.id = :id OR p.logicId = :id)', {
          t: `%${title}%`,
          id: parseInt(title) || -1,
        });
      }
    }

    if (todoOnly && userId) {
      const subQ = this.submissionRepo
        .createQueryBuilder('s')
        .select('s.problemId')
        .where('s.status = 0')
        .andWhere('s.userId = :userId', { userId });
      qb.andWhere(`p.id NOT IN (${subQ.getQuery()})`).setParameters({
        ...qb.getParameters(),
        ...subQ.getParameters(),
      });
    }

    const [problems, count] = await Promise.all([qb.getMany(), qb.getCount()]);
    return [problems, count];
  }

  /**
   * GET /problems/manage-partial
   * 管理员视角的题目列表（包含隐藏题目）
   */
  async managePartial(
    page = 1,
    perPage = 12,
    tags: number[] = [],
    title?: string,
  ): Promise<[Problem[], number]> {
    return this.digestPartial(page, perPage, tags, title, true);
  }

  /**
   * GET /problems/manage/available-digest
   * 管理员可用题目的摘要（未关闭的题目）
   */
  async manageAvailableDigest(
    page = 1,
    perPage = 12,
  ): Promise<[Problem[], number]> {
    return this.problemRepo.findAndCount({
      where: { closed: false },
      select: [
        'id',
        'title',
        'accepts',
        'submits',
        'restricted',
        'logicId',
        'prefix',
      ],
      relations: ['tags'],
      take: perPage,
      skip: (page - 1) * perPage,
    });
  }

  /**
   * GET /problems/:id/ratio
   * 题目通过率（accepts/submits，按 status 分组）
   */
  async getProblemRatio(problemId: number) {
    const problem = await this.problemRepo.findOne({
      select: ['id', 'closed', 'restricted'],
      where: { id: problemId },
    });
    if (!problem) throw new NotFoundException(`题目 #${problemId} 不存在`);
    if (problem.closed || problem.restricted) throw new ForbiddenException();

    return this.submissionRepo
      .createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('s.problemId = :problemId', { problemId })
      .groupBy('s.status')
      .cache(30 * 1000)
      .getRawMany();
  }

  /**
   * GET /problems/:id/refs
   * 题目被引用情况（在哪些竞赛/课程中使用）
   */
  async refs(problemId: number) {
    return Promise.all([
      this.courseProblemRepo.find({
        where: { problemId },
        relations: ['course'],
        order: { courseId: 'DESC' },
      }),
      this.contestProblemRepo.find({
        where: { problemId },
        relations: ['contest'],
        order: { contestId: 'DESC' },
      }),
    ]);
  }

  /**
   * GET /problems/:id/tag
   * 获取题目标签列表
   */
  async getTags(id: number): Promise<Tag[]> {
    const problem = await this.problemRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);
    return problem.tags ?? [];
  }

  /**
   * POST /problems/:id/tag
   * 给题目添加标签（body: { tagId: number }）
   */
  async addTag(id: number, tagId: number): Promise<Tag[]> {
    const problem = await this.problemRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException(`标签 #${tagId} 不存在`);

    const alreadyHas = problem.tags?.some((t) => t.id === tagId);
    if (!alreadyHas) {
      problem.tags = [...(problem.tags ?? []), tag];
      await this.problemRepo.save(problem);
    }

    return problem.tags;
  }

  /**
   * DELETE /problems/:id/tag/:tagId
   * 移除题目标签
   */
  async removeTag(id: number, tagId: number): Promise<Tag[]> {
    const problem = await this.problemRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    problem.tags = (problem.tags ?? []).filter((t) => t.id !== tagId);
    await this.problemRepo.save(problem);

    return problem.tags;
  }

  /**
   * GET /problems/:id/test-cases
   * 获取测试用例文件列表
   */
  async getTestCasesFiles(id: number): Promise<string[]> {
    const problem = await this.problemRepo.findOne({
      where: { id },
      select: ['id', 'prefix', 'logicId'],
    });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    const dir = path.join(
      TEST_CASES_PATH,
      problem.prefix,
      problem.logicId.toString(),
    );
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir);
  }

  /**
   * POST /problems/import-fps
   * 从 FPS XML 格式导入题目
   */
  async importFps(
    buffer: Buffer,
    params: {
      checkOnly: boolean;
      indices: number[];
      prefix: string;
      source: string;
      restricted: boolean;
      closed: boolean;
      noMarkdown: boolean;
    },
  ) {
    if (params.checkOnly) {
      return this.parseFps(buffer, true, params.noMarkdown);
    }
    return this.saveFps(buffer, params);
  }

  /**
   * POST /problems/simp-extra
   * 快速创建题目骨架
   */
  async simpCreateExtra(
    title: string,
    prefix: string,
    createrId: number,
  ): Promise<Problem> {
    prefix = prefix.toLowerCase();

    let result!: Problem;
    await this.dataSource.transaction(async (manager) => {
      const { maxId } = await manager
        .createQueryBuilder(Problem, 'p')
        .select('MAX(p.logicId)', 'maxId')
        .where('p.prefix = :prefix', { prefix })
        .getRawOne();
      const nextId: number = maxId != null ? maxId + 1 : 1000;

      result = manager.create(Problem, {
        title,
        content:
          '#### 题目描述\n\n' +
          '#### 输入描述\n\n' +
          '#### 输出描述\n\n' +
          '#### 样例输入\n```\n\n```\n' +
          '#### 样例输出\n```\n\n```\n',
        memoryLimit: 64,
        timeLimit: 1000,
        source: 'Leverage',
        cases: 0,
        createrId,
        prefix,
        logicId: nextId,
      });
      result = await manager.save(Problem, result);
    });

    const problemPath = path.join(
      TEST_CASES_PATH,
      result.prefix,
      result.logicId.toString(),
    );
    await ensureDir(problemPath);
    await writeFile(path.join(problemPath, 'keep'), '');

    return result;
  }

  /**
   * POST /problems/batch-zip-hash
   * 批量获取测试数据 zip 的 hash（用于校验）
   */
  async manuallyZipHashTestCase(opt: ZipHashDto): Promise<{ message: string }> {
    let problemIds: number[] = [];

    if (opt.all) {
      const problems = await this.problemRepo.find({
        select: ['id'],
        where: { cases: MoreThan(0) },
      });
      problemIds = problems.map((p) => p.id);
    } else if (opt.problems) {
      problemIds = opt.problems;
    }

    // Fire-and-forget background zip+hash
    this.doZipHash(problemIds).catch((e) => Logger.error(e, 'ZipHash'));

    return { message: `已排队 ${problemIds.length} 个题目` };
  }

  /**
   * GET /problems/:id/checker
   * 获取题目的 Special Judge checker 信息（checkerCode 需要额外 select）
   */
  async getChecker(
    id: number,
  ): Promise<{ checkerCode: string | null; checkerLanguage: string | null }> {
    const problem = await this.problemRepo
      .createQueryBuilder('p')
      .addSelect('p.checkerCode')
      .where('p.id = :id', { id })
      .getOne();
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);
    return {
      checkerCode: problem.checkerCode ?? null,
      checkerLanguage: problem.checkerLanguage ?? null,
    };
  }

  /**
   * PATCH /problems/:id/checker
   * 更新题目的 Special Judge checker 代码和语言
   */
  async setChecker(
    id: number,
    checkerCode: string,
    checkerLanguage: string,
  ): Promise<{ checkerCode: string; checkerLanguage: string }> {
    const problem = await this.problemRepo.findOne({ where: { id } });
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`);

    await this.problemRepo
      .createQueryBuilder()
      .update(Problem)
      .set({ checkerCode, checkerLanguage })
      .where('id = :id', { id })
      .execute();

    await this.cacheService.del(`problem:${id}:admin`, `problem:${id}:user`);
    return { checkerCode, checkerLanguage };
  }

  /**
   * GET /problems/course-problem-list/:courseId
   * 获取课程的题目列表
   */
  async courseProblemList(courseId: number): Promise<number[]> {
    const entries = await this.courseProblemRepo.find({
      where: { courseId },
      select: ['problemId'],
    });
    return entries.map((e) => e.problemId);
  }

  /**
   * GET /problems/contest-problem-list/:contestId
   * 获取竞赛的题目列表
   */
  async contestProblemList(contestId: number): Promise<number[]> {
    const entries = await this.contestProblemRepo.find({
      where: { contestId },
      select: ['problemId'],
    });
    return entries.map((e) => e.problemId);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────

  async getNextLogicId(prefix: string): Promise<number> {
    const result = await this.problemRepo
      .createQueryBuilder('p')
      .select('MAX(p.logicId)', 'maxId')
      .where('p.prefix = :prefix', { prefix: prefix.toLowerCase() })
      .getRawOne();
    return result?.maxId != null ? result.maxId + 1 : 1000;
  }

  private validateZipFile(file: Express.Multer.File): void {
    const allowedMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip' || !allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('测试数据必须是 .zip 文件');
    }
  }

  formatDisplayId(problem: Problem): string {
    return `${problem.prefix.toUpperCase()}${problem.logicId}`;
  }

  private async parseFps(
    buffer: Buffer,
    preview: boolean,
    noMarkdown: boolean,
  ): Promise<
    Array<Partial<Problem> & { testInputs: string[]; testOutputs: string[] }>
  > {
    const ts = new TurndownService({ hr: '---' });
    ts.addRule('pre', {
      filter: ['pre'],
      replacement: (content: string) => '```\n' + content + '\n```\n',
    });
    ts.addRule('h3', {
      filter: ['h3'],
      replacement: (content: string) => '#### ' + content,
    });
    ts.addRule('style', {
      filter: ['style'],
      replacement: () => '',
    });

    const parser = new XmlParser();
    const data = buffer.toString('utf-8');
    const fps: FPSRawObject = await parser.parseStringPromise(data);
    const problems = fps.fps.item;

    const cn = ['题目描述', '样例输入', '样例输出', '提示'];
    const en = ['Description', 'Sample Input', 'Sample Output', 'Hint'];

    function codeBlock(c: string) {
      return '<pre class="hljs"><code>' + c + '</code></pre>';
    }

    const results: Array<
      Partial<Problem> & { testInputs: string[]; testOutputs: string[] }
    > = [];

    for (const p of problems) {
      // 提取 SPJ checker 信息（如有）——不再跳过 SPJ 题目
      let checkerCode: string | undefined;
      let checkerLanguage: string | undefined;
      if (p.spj) {
        const spjEntry = (p.spj as unknown[])[0];
        if (spjEntry && typeof spjEntry === 'object') {
          const entry = spjEntry as Record<string, unknown>;
          checkerCode = (entry['_'] as string | undefined)?.trim() || undefined;
          const attrs = entry['$'] as Record<string, string> | undefined;
          if (attrs?.language) {
            checkerLanguage = attrs.language;
          }
        } else if (typeof spjEntry === 'string' && spjEntry.trim().length > 0) {
          checkerCode = spjEntry.trim();
        }
      }

      const problem: Partial<Problem> & {
        testInputs: string[];
        testOutputs: string[];
        checkerCode?: string;
        checkerLanguage?: string;
      } = {
        testInputs: [],
        testOutputs: [],
        ...(checkerCode ? { checkerCode } : {}),
        ...(checkerLanguage ? { checkerLanguage } : {}),
      };

      problem.title = decode(p.title[0] || '');
      problem.timeLimit = parseInt(p.time_limit[0]) || 0;
      problem.memoryLimit = parseInt(p.memory_limit[0]) || 0;
      problem.source = decode(p.source[0] || '');

      const lang = /[\u4e00-\u9fa5]/.test(p.description[0]) ? cn : en;

      let content = `<h4>${lang[0]}</h4>${p.description[0] || ''}`;

      const single = p.sample_input.length === 1;
      for (const [i, e] of p.sample_input.entries()) {
        if (e && p.sample_output?.[i] !== undefined) {
          content +=
            `<h4>${lang[1]}${!single ? `#${i + 1}` : ''}</h4>${codeBlock(e)}` +
            `<h4>${lang[2]}${!single ? `#${i + 1}` : ''}</h4>${codeBlock(p.sample_output[i])}`;
        }
      }

      if (p.hint?.[0]?.length) content += `<h4>${lang[3]}</h4>${p.hint[0]}`;

      if (!noMarkdown) content = ts.turndown(content);
      problem.content = decode(content);

      problem.cases = 0;
      if (p.test_input && p.test_output) {
        for (let i = 0; ; i++) {
          if (p.test_input[i] === undefined || p.test_output[i] === undefined)
            break;
          if (!preview) {
            problem.testInputs.push(p.test_input[i]);
            problem.testOutputs.push(p.test_output[i]);
          }
          problem.cases++;
        }
      }

      results.push(problem);
    }

    return results;
  }

  private async saveFps(
    buffer: Buffer,
    params: {
      indices: number[];
      prefix: string;
      source: string;
      restricted: boolean;
      closed: boolean;
      noMarkdown: boolean;
    },
  ): Promise<Problem[]> {
    const prefix = params.prefix.toLowerCase();
    const parsed = await this.parseFps(buffer, false, params.noMarkdown);
    const saved: Problem[] = [];

    for (const [i, p] of parsed.entries()) {
      if (!params.indices.includes(i)) continue;

      let result!: Problem;
      await this.dataSource.transaction(async (manager) => {
        const { maxId } = await manager
          .createQueryBuilder(Problem, 'p')
          .select('MAX(p.logicId)', 'maxId')
          .where('p.prefix = :prefix', { prefix })
          .getRawOne();
        const nextId: number = maxId != null ? maxId + 1 : 1000;

        const pWithChecker = p as typeof p & {
          checkerCode?: string;
          checkerLanguage?: string;
        };
        result = manager.create(Problem, {
          title: p.title,
          content: p.content,
          memoryLimit: p.memoryLimit || 128,
          timeLimit: p.timeLimit || 1000,
          source: params.source || p.source || 'Leverage',
          cases: p.cases ?? 0,
          createrId: 1,
          prefix,
          logicId: nextId,
          restricted: params.restricted,
          closed: params.closed,
          ...(pWithChecker.checkerCode
            ? { checkerCode: pWithChecker.checkerCode }
            : {}),
          ...(pWithChecker.checkerLanguage
            ? { checkerLanguage: pWithChecker.checkerLanguage }
            : {}),
        });
        result = await manager.save(Problem, result);
        saved.push(result);
      });

      const destDir = path.join(
        TEST_CASES_PATH,
        result.prefix,
        result.logicId.toString(),
      );
      await ensureDir(destDir);
      for (const [idx, input] of (p.testInputs ?? []).entries()) {
        await writeFile(path.join(destDir, `${idx + 1}.in`), input);
      }
      for (const [idx, output] of (p.testOutputs ?? []).entries()) {
        await writeFile(path.join(destDir, `${idx + 1}.out`), output);
      }
    }

    return saved;
  }

  private async doZipHash(problemIds: number[]): Promise<void> {
    for (const id of problemIds) {
      try {
        const problem = await this.problemRepo.findOne({
          where: { id },
          select: ['id', 'prefix', 'logicId'],
        });
        if (!problem) continue;
        Logger.log(`ZipHash: processing problem ${id}`, 'ZipHash');
        // Actual zip+hash logic depends on storage backend
      } catch (e: any) {
        Logger.error(
          `ZipHash failed for problem ${id}: ${e?.message}`,
          'ZipHash',
        );
      }
    }
    Logger.log('ZipHash: done', 'ZipHash');
  }
}
