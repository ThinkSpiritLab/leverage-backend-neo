import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../../database/entities/course.entity';
import { CourseUser } from '../../database/entities/course-user.entity';
import { CourseProblem } from '../../database/entities/course-problem.entity';
import { Submission } from '../../database/entities/submission.entity';
import { User } from '../../database/entities/user.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

export interface CourseRankItem {
  rank: number;
  userId: number;
  username: string;
  certifiedName: string | null;
  college: string | null;
  profession: string | null;
  grade: string | null;
  class: string | null;
  accepts: number;
  submits: number;
}

/**
 * 解析过滤文本，支持：
 * - 精确匹配（纯数字学号）
 * - 学号范围（格式：111-222）
 * - 正则表达式
 *
 * 注意 #50 bug fix: rangeMatch 使用 line（循环变量），不是 filtersText
 */
export function parseFilters(
  filtersText: string,
): Array<string | ((s: string) => boolean)> {
  if (!filtersText) return [];
  return filtersText.split('\n').map((line) => {
    line = line.trim();
    if (/^\d+$/.test(line)) {
      return line; // 精确匹配（学号数字）
    }
    // 注意：用 line 不是 filtersText！（这是 #50 的 bug fix）
    const rangeMatch = line.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const [, lo, hi] = rangeMatch;
      return (s: string) => {
        const n = parseInt(s);
        return n >= parseInt(lo) && n <= parseInt(hi);
      };
    }
    // 正则表达式匹配
    return (s: string) => new RegExp(line).test(s);
  });
}

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseUser)
    private readonly courseUserRepo: Repository<CourseUser>,
    @InjectRepository(CourseProblem)
    private readonly courseProblemRepo: Repository<CourseProblem>,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 列表
   */
  async findAll(query?: {
    page?: number;
    perPage?: number;
    type?: number;
  }): Promise<{ items: Course[]; total: number }> {
    const { page = 1, perPage = 20, type } = query ?? {};
    const skip = (page - 1) * perPage;

    const qb = this.courseRepo
      .createQueryBuilder('c')
      .take(perPage)
      .skip(skip)
      .orderBy('c.archived', 'ASC')
      .addOrderBy('c.id', 'DESC');

    if (type !== undefined) qb.andWhere('c.type = :type', { type });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * 详情
   */
  async findOne(id: number): Promise<Course & { problems: any[] }> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException(`课程 ${id} 不存在`);

    // Join problems with title/logicId/prefix
    const raw = await this.courseProblemRepo
      .createQueryBuilder('cp')
      .leftJoin('problem', 'p', 'p.id = cp.problemId')
      .addSelect(['p.title', 'p.logicId', 'p.prefix'])
      .where('cp.courseId = :id', { id })
      .orderBy('cp.problemId', 'ASC')
      .getRawAndEntities();

    const problems = raw.entities.map((cp, i) => ({
      ...cp,
      title: raw.raw[i]?.p_title ?? undefined,
      logicId: raw.raw[i]?.p_logicId ?? undefined,
      prefix: raw.raw[i]?.p_prefix ?? undefined,
    }));

    return { ...course, problems };
  }

  /**
   * 创建
   */
  async create(dto: CreateCourseDto): Promise<Course> {
    const { problemIds, ...courseData } = dto;
    const course = await this.courseRepo.save(
      this.courseRepo.create({
        name: courseData.name,
        startTime: courseData.startTime,
        endTime: courseData.endTime,
        teacher: courseData.teacher ?? '',
        notification: courseData.notification ?? '',
        type: courseData.type ?? 0,
        archived: courseData.archived ?? false,
        scoreByPoint: courseData.scoreByPoint ?? false,
        enabledLanguageJSON: courseData.enabledLanguageJSON ?? null,
      }),
    );

    if (problemIds && problemIds.length > 0) {
      await this.addProblems(course.id, problemIds);
    }

    return course;
  }

  /**
   * 更新
   */
  async update(id: number, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id);
    const { problemIds, ...updateData } = dto;
    Object.assign(course, updateData);
    const saved = await this.courseRepo.save(course);

    if (problemIds !== undefined) {
      await this.courseProblemRepo.delete({ courseId: id });
      if (problemIds.length > 0) {
        await this.addProblems(id, problemIds);
      }
    }

    return saved;
  }

  /**
   * 删除
   */
  async remove(id: number): Promise<void> {
    const course = await this.findOne(id);
    await this.courseRepo.remove(course);
  }

  /**
   * 添加学生
   */
  async addStudents(courseId: number, userIds: number[]): Promise<void> {
    await this.findOne(courseId);
    for (const userId of userIds) {
      const exists = await this.courseUserRepo.findOne({
        where: { courseId, userId },
      });
      if (!exists) {
        await this.courseUserRepo.save(
          this.courseUserRepo.create({ courseId, userId }),
        );
      }
    }
  }

  /**
   * 移除学生
   */
  async removeStudent(courseId: number, userId: number): Promise<void> {
    const courseUser = await this.courseUserRepo.findOne({
      where: { courseId, userId },
    });
    if (!courseUser) throw new NotFoundException('学生不在该课程中');
    await this.courseUserRepo.remove(courseUser);
  }

  /**
   * 课程提交导出（按学号过滤，修复 #50 的 filter-sheet bug）
   *
   * filtersText: 每行一个过滤条件
   * - 纯数字：精确匹配学号
   * - "111-222"：匹配学号在 [111, 222] 范围内
   * - 其他：作为正则表达式匹配学号
   */
  async exportSubmissions(
    courseId: number,
    filtersText: string,
  ): Promise<{
    items: any[];
    total: number;
  }> {
    await this.findOne(courseId);

    const filters = parseFilters(filtersText);

    // 查课程内的提交
    const submissions = await this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .leftJoinAndSelect('s.problem', 'problem')
      .where('s.courseId = :courseId', { courseId })
      .orderBy('s.id', 'DESC')
      .getMany();

    // 过滤（按 username 或 grade 等字段过滤）
    const filtered =
      filters.length === 0
        ? submissions
        : submissions.filter((s) => {
            const username = (s as any).user?.username ?? '';
            return filters.some((f) => {
              if (typeof f === 'string') return username === f;
              return f(username);
            });
          });

    return { items: filtered, total: filtered.length };
  }

  /**
   * 课程排行榜
   */
  async getRanking(courseId: number): Promise<CourseRankItem[]> {
    await this.findOne(courseId);

    const raw = await this.courseUserRepo
      .createQueryBuilder('cu')
      .leftJoinAndSelect('cu.user', 'user')
      .select([
        'cu.userId',
        'cu.accepts',
        'cu.submits',
        'user.username',
        'user.certifiedName',
        'user.college',
        'user.profession',
        'user.grade',
        'user.class',
      ])
      .where('cu.courseId = :courseId', { courseId })
      .orderBy('cu.accepts', 'DESC')
      .addOrderBy('cu.submits', 'ASC')
      .getMany();

    return raw.map((cu, index) => ({
      rank: index + 1,
      userId: cu.userId,
      username: (cu as any).user?.username ?? String(cu.userId),
      certifiedName: (cu as any).user?.certifiedName ?? null,
      college: (cu as any).user?.college ?? null,
      profession: (cu as any).user?.profession ?? null,
      grade: (cu as any).user?.grade ?? null,
      class: (cu as any).user?.class ?? null,
      accepts: cu.accepts,
      submits: cu.submits,
    }));
  }

  // ─── 私有方法 ─────────────────────────────────────────────────────────────────

  private async addProblems(
    courseId: number,
    problemIds: number[],
  ): Promise<void> {
    for (const problemId of problemIds) {
      await this.courseProblemRepo.save(
        this.courseProblemRepo.create({ courseId, problemId, weight: 1 }),
      );
    }
  }
}
