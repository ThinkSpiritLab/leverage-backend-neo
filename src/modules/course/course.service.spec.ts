import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Course } from '../../database/entities/course.entity';
import { CourseUser } from '../../database/entities/course-user.entity';
import { CourseProblem } from '../../database/entities/course-problem.entity';
import { Submission } from '../../database/entities/submission.entity';
import { User } from '../../database/entities/user.entity';
import { DataSource } from 'typeorm';
import { CourseService, parseFilters } from './course.service';

// ─── Mock helpers ────────────────────────────────────────────────────────────

const makeQb = (overrides: Record<string, any> = {}) => {
  const qb: any = {
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getRawAndEntities: jest.fn().mockResolvedValue({ raw: [], entities: [] }),
    ...overrides,
  };
  return qb;
};

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: { query: jest.fn().mockResolvedValue([]) },
});

const courseFixture = {
  id: 1,
  name: 'Test Course',
  startTime: new Date('2024-01-01'),
  endTime: new Date('2024-06-30'),
  teacher: 'Prof. Wang',
  notification: '',
  type: 0,
  archived: false,
  scoreByPoint: false,
  enabledLanguageJSON: null,
};

// ─── parseFilters 单元测试 ────────────────────────────────────────────────────

describe('parseFilters (filter-sheet #50 fix)', () => {
  describe('精确匹配', () => {
    it('纯数字返回字符串', () => {
      const filters = parseFilters('2021001001');
      expect(filters).toHaveLength(1);
      expect(typeof filters[0]).toBe('string');
      expect(filters[0]).toBe('2021001001');
    });

    it('多个精确匹配', () => {
      const filters = parseFilters('2021001001\n2021001002');
      expect(filters).toHaveLength(2);
      expect(filters[0]).toBe('2021001001');
      expect(filters[1]).toBe('2021001002');
    });
  });

  describe('学号段范围过滤（#50 rangeMatch 用 line）', () => {
    it('范围过滤返回函数', () => {
      const filters = parseFilters('2021001001-2021001010');
      expect(filters).toHaveLength(1);
      expect(typeof filters[0]).toBe('function');

      const fn = filters[0] as (s: string) => boolean;
      expect(fn('2021001001')).toBe(true);
      expect(fn('2021001005')).toBe(true);
      expect(fn('2021001010')).toBe(true);
      expect(fn('2021001000')).toBe(false);
      expect(fn('2021001011')).toBe(false);
    });

    it('简单数字范围', () => {
      const filters = parseFilters('100-200');
      const fn = filters[0] as (s: string) => boolean;
      expect(fn('100')).toBe(true);
      expect(fn('150')).toBe(true);
      expect(fn('200')).toBe(true);
      expect(fn('99')).toBe(false);
      expect(fn('201')).toBe(false);
    });

    it('多行混合：精确 + 范围', () => {
      const filters = parseFilters('2021001001\n2021002001-2021002010');
      expect(filters).toHaveLength(2);
      expect(typeof filters[0]).toBe('string');
      expect(typeof filters[1]).toBe('function');
    });
  });

  describe('正则表达式过滤', () => {
    it('正则匹配', () => {
      const filters = parseFilters('2021.*');
      const fn = filters[0] as (s: string) => boolean;
      expect(fn('2021001001')).toBe(true);
      expect(fn('2022001001')).toBe(false);
    });

    it('前缀正则', () => {
      const filters = parseFilters('^2021');
      const fn = filters[0] as (s: string) => boolean;
      expect(fn('2021001001')).toBe(true);
      expect(fn('2022001001')).toBe(false);
    });
  });

  describe('空输入', () => {
    it('空字符串返回空数组', () => {
      const filters = parseFilters('');
      expect(filters).toEqual([]);
    });
  });

  describe('#50 回归测试', () => {
    it('rangeMatch 使用循环变量 line，多行情况正确解析', () => {
      const filtersText = '99\n100-200\n301';
      const filters = parseFilters(filtersText);

      expect(filters).toHaveLength(3);
      expect(filters[0]).toBe('99');
      expect(typeof filters[1]).toBe('function');
      expect(filters[2]).toBe('301');

      const rangeFn = filters[1] as (s: string) => boolean;
      expect(rangeFn('100')).toBe(true);
      expect(rangeFn('150')).toBe(true);
      expect(rangeFn('200')).toBe(true);
      expect(rangeFn('99')).toBe(false);
      expect(rangeFn('201')).toBe(false);
    });
  });
});

// ─── CourseService 测试 ───────────────────────────────────────────────────────

describe('CourseService', () => {
  let service: CourseService;
  let courseRepo: ReturnType<typeof mockRepo>;
  let courseUserRepo: ReturnType<typeof mockRepo>;
  let courseProblemRepo: ReturnType<typeof mockRepo>;
  let submissionRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: getRepositoryToken(Course), useFactory: mockRepo },
        { provide: getRepositoryToken(CourseUser), useFactory: mockRepo },
        { provide: getRepositoryToken(CourseProblem), useFactory: mockRepo },
        { provide: getRepositoryToken(Submission), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
    courseRepo = module.get(getRepositoryToken(Course));
    courseUserRepo = module.get(getRepositoryToken(CourseUser));
    courseProblemRepo = module.get(getRepositoryToken(CourseProblem));
    submissionRepo = module.get(getRepositoryToken(Submission));
    userRepo = module.get(getRepositoryToken(User));

    // findOne/update/remove 等路径会查询课程题目联表
    courseProblemRepo.createQueryBuilder.mockReturnValue(makeQb());
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('返回课程列表', async () => {
      const qb = makeQb({
        getManyAndCount: jest.fn().mockResolvedValue([[courseFixture], 1]),
      });
      courseRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll();

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('默认分页参数', async () => {
      const qb = makeQb();
      courseRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll();

      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.skip).toHaveBeenCalledWith(0);
    });

    it('自定义分页参数', async () => {
      const qb = makeQb();
      courseRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 3, perPage: 5 });

      expect(qb.take).toHaveBeenCalledWith(5);
      expect(qb.skip).toHaveBeenCalledWith(10);
    });

    it('按 type 过滤', async () => {
      const qb = makeQb();
      courseRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ type: 1 });

      expect(qb.andWhere).toHaveBeenCalledWith('c.type = :type', { type: 1 });
    });

    it('不传 type 时不添加过滤', async () => {
      const qb = makeQb();
      courseRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({});

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('不传参数时使用默认值', async () => {
      const qb = makeQb();
      courseRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(undefined);

      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('返回课程详情', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Course');
    });

    it('课程不存在时抛 NotFoundException', async () => {
      courseRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow('课程 999 不存在');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('创建课程（无题目）', async () => {
      const created = { ...courseFixture };
      courseRepo.create.mockReturnValue(created);
      courseRepo.save.mockResolvedValue(created);

      const result = await service.create({
        name: 'Test Course',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      expect(courseRepo.create).toHaveBeenCalled();
      expect(courseRepo.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('创建课程时使用默认值', async () => {
      const created = { id: 1 };
      courseRepo.create.mockReturnValue(created);
      courseRepo.save.mockResolvedValue(created);

      await service.create({
        name: 'Defaults',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      expect(courseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          teacher: '',
          notification: '',
          type: 0,
          archived: false,
          scoreByPoint: false,
        }),
      );
    });

    it('创建课程（含题目）', async () => {
      const created = { id: 2 };
      courseRepo.create.mockReturnValue(created);
      courseRepo.save.mockResolvedValue(created);
      courseProblemRepo.create.mockReturnValue({});
      courseProblemRepo.save.mockResolvedValue({});

      await service.create({
        name: 'With Problems',
        startTime: new Date(),
        endTime: new Date(),
        problemIds: [1, 2, 3],
      } as any);

      expect(courseProblemRepo.save).toHaveBeenCalledTimes(3);
    });

    it('空题目列表时不添加题目', async () => {
      const created = { id: 3 };
      courseRepo.create.mockReturnValue(created);
      courseRepo.save.mockResolvedValue(created);

      await service.create({
        name: 'No Problems',
        startTime: new Date(),
        endTime: new Date(),
        problemIds: [],
      } as any);

      expect(courseProblemRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('更新课程信息', async () => {
      courseRepo.findOne.mockResolvedValue({ ...courseFixture });
      courseRepo.save.mockResolvedValue({ ...courseFixture, name: 'Updated' });

      const result = await service.update(1, { name: 'Updated' } as any);

      expect(courseRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('Updated');
    });

    it('课程不存在时抛 NotFoundException', async () => {
      courseRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('更新时替换题目列表', async () => {
      courseRepo.findOne.mockResolvedValue({ ...courseFixture });
      courseRepo.save.mockResolvedValue(courseFixture);
      courseProblemRepo.delete.mockResolvedValue({ affected: 2 });
      courseProblemRepo.create.mockReturnValue({});
      courseProblemRepo.save.mockResolvedValue({});

      await service.update(1, { problemIds: [10, 20] } as any);

      expect(courseProblemRepo.delete).toHaveBeenCalledWith({ courseId: 1 });
      expect(courseProblemRepo.save).toHaveBeenCalledTimes(2);
    });

    it('传空题目列表清空所有题目', async () => {
      courseRepo.findOne.mockResolvedValue({ ...courseFixture });
      courseRepo.save.mockResolvedValue(courseFixture);
      courseProblemRepo.delete.mockResolvedValue({ affected: 2 });

      await service.update(1, { problemIds: [] } as any);

      expect(courseProblemRepo.delete).toHaveBeenCalledWith({ courseId: 1 });
      expect(courseProblemRepo.save).not.toHaveBeenCalled();
    });

    it('不传 problemIds 则不修改题目', async () => {
      courseRepo.findOne.mockResolvedValue({ ...courseFixture });
      courseRepo.save.mockResolvedValue(courseFixture);

      await service.update(1, { name: 'No Problem Update' } as any);

      expect(courseProblemRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('删除课程', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      courseRepo.remove.mockResolvedValue(undefined);

      await service.remove(1);

      expect(courseRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: courseFixture.id, name: courseFixture.name }),
      );
    });

    it('课程不存在时抛 NotFoundException', async () => {
      courseRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addStudents ─────────────────────────────────────────────────────────

  describe('addStudents', () => {
    it('添加不存在的学生', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      courseUserRepo.findOne.mockResolvedValue(null);
      courseUserRepo.create.mockReturnValue({});
      courseUserRepo.save.mockResolvedValue({});

      await service.addStudents(1, [101, 102]);

      expect(courseUserRepo.save).toHaveBeenCalledTimes(2);
    });

    it('已存在的学生不重复添加', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      courseUserRepo.findOne.mockResolvedValue({ courseId: 1, userId: 101 });

      await service.addStudents(1, [101]);

      expect(courseUserRepo.save).not.toHaveBeenCalled();
    });

    it('课程不存在时抛 NotFoundException', async () => {
      courseRepo.findOne.mockResolvedValue(null);

      await expect(service.addStudents(999, [1])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('混合新旧学生：只添加新学生', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      courseUserRepo.findOne
        .mockResolvedValueOnce({ courseId: 1, userId: 101 }) // 已存在
        .mockResolvedValueOnce(null); // 新增
      courseUserRepo.create.mockReturnValue({});
      courseUserRepo.save.mockResolvedValue({});

      await service.addStudents(1, [101, 102]);

      expect(courseUserRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── removeStudent ───────────────────────────────────────────────────────

  describe('removeStudent', () => {
    it('移除学生', async () => {
      const courseUser = { courseId: 1, userId: 101 };
      courseUserRepo.findOne.mockResolvedValue(courseUser);
      courseUserRepo.remove.mockResolvedValue(undefined);

      await service.removeStudent(1, 101);

      expect(courseUserRepo.remove).toHaveBeenCalledWith(courseUser);
    });

    it('学生不在课程时抛 NotFoundException', async () => {
      courseUserRepo.findOne.mockResolvedValue(null);

      await expect(service.removeStudent(1, 999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.removeStudent(1, 999)).rejects.toThrow(
        '学生不在该课程中',
      );
    });
  });

  // ─── exportSubmissions ───────────────────────────────────────────────────

  describe('exportSubmissions', () => {
    const makeSubmission = (username: string) => ({
      id: Math.random(),
      user: { username },
      problem: { id: 1, title: 'P1' },
    });

    it('课程不存在时抛 NotFoundException', async () => {
      courseRepo.findOne.mockResolvedValue(null);

      await expect(service.exportSubmissions(999, '')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('无过滤条件时返回所有提交', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      const submissions = [makeSubmission('alice'), makeSubmission('bob')];
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue(submissions) });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.exportSubmissions(1, '');

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('精确匹配过滤', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      const submissions = [makeSubmission('alice'), makeSubmission('bob')];
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue(submissions) });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.exportSubmissions(1, 'alice');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].user.username).toBe('alice');
    });

    it('正则过滤', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      const submissions = [
        makeSubmission('user2021001'),
        makeSubmission('user2022001'),
      ];
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue(submissions) });
      submissionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.exportSubmissions(1, 'user2021.*');

      expect(result.items).toHaveLength(1);
    });
  });

  // ─── getRanking ──────────────────────────────────────────────────────────

  describe('getRanking', () => {
    it('课程不存在时抛 NotFoundException', async () => {
      courseRepo.findOne.mockResolvedValue(null);

      await expect(service.getRanking(999)).rejects.toThrow(NotFoundException);
    });

    it('返回排行榜', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);

      const rawData = [
        {
          userId: 1,
          accepts: 10,
          submits: 12,
          user: {
            username: 'alice',
            certifiedName: 'Alice',
            college: 'CS',
            profession: 'SE',
            grade: '2021',
            class: '1',
          },
        },
        {
          userId: 2,
          accepts: 8,
          submits: 10,
          user: {
            username: 'bob',
            certifiedName: null,
            college: null,
            profession: null,
            grade: null,
            class: null,
          },
        },
      ];
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue(rawData) });
      courseUserRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getRanking(1);

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].username).toBe('alice');
      expect(result[0].accepts).toBe(10);
      expect(result[1].rank).toBe(2);
    });

    it('用户信息为空时使用 userId 作为 username', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);

      const rawData = [{ userId: 99, accepts: 5, submits: 7, user: undefined }];
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue(rawData) });
      courseUserRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getRanking(1);

      expect(result[0].username).toBe('99');
      expect(result[0].certifiedName).toBeNull();
    });

    it('排行榜为空时返回空数组', async () => {
      courseRepo.findOne.mockResolvedValue(courseFixture);
      const qb = makeQb({ getMany: jest.fn().mockResolvedValue([]) });
      courseUserRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getRanking(1);
      expect(result).toEqual([]);
    });
  });
});
