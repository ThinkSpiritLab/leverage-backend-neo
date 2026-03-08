import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProblemService } from './problem.service'
import { Problem } from '../../database/entities/problem.entity'
import { Tag } from '../../database/entities/tag.entity'
import { CacheService } from '../redis/cache.service'

describe('ProblemService', () => {
  let service: ProblemService
  let problemRepo: jest.Mocked<Repository<Problem>>
  let tagRepo: jest.Mocked<Repository<Tag>>
  let cacheService: jest.Mocked<CacheService>

  const mockProblem: Problem = {
    id: 1,
    prefix: 'p',
    logicId: 1001,
    title: 'Test Problem',
    content: '## 题目描述',
    source: 'Leverage',
    timeLimit: 1000,
    memoryLimit: 64,
    difficulty: 2,
    cases: 3,
    multiCases: false,
    submits: 0,
    accepts: 0,
    restricted: false,
    status: 0 as any,
    statusUpdatedAt: null as any,
    closed: false,
    createrId: null as any,
    creater: null,
    tags: [],
    spjId: null as any,
    spj: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockProblem], 1]),
      getOne: jest.fn().mockResolvedValue(mockProblem),
      getRawOne: jest.fn().mockResolvedValue({ maxId: 1000 }),
    }

    problemRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOne: jest.fn().mockResolvedValue(mockProblem),
      findBy: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue(mockProblem),
      save: jest.fn().mockResolvedValue(mockProblem),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any

    tagRepo = {
      findBy: jest.fn().mockResolvedValue([]),
    } as any

    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProblemService,
        { provide: getRepositoryToken(Problem), useValue: problemRepo },
        { provide: getRepositoryToken(Tag), useValue: tagRepo },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile()

    service = module.get<ProblemService>(ProblemService)
  })

  // ─── zip 校验测试 ──────────────────────────────────────────────────────────

  describe('uploadTestData - zip 文件校验', () => {
    it('应该接受合法的 .zip 文件', async () => {
      const file = {
        originalname: 'testdata.zip',
        mimetype: 'application/zip',
        buffer: Buffer.from(''),
      } as Express.Multer.File

      await expect(service.uploadTestData(1, file)).resolves.not.toThrow()
    })

    it('应该拒绝 .txt 文件（抛出 BadRequestException）', async () => {
      const file = {
        originalname: 'testdata.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from(''),
      } as Express.Multer.File

      await expect(service.uploadTestData(1, file)).rejects.toThrow(BadRequestException)
    })

    it('应该拒绝 .rar 文件（抛出 BadRequestException）', async () => {
      const file = {
        originalname: 'testdata.rar',
        mimetype: 'application/x-rar-compressed',
        buffer: Buffer.from(''),
      } as Express.Multer.File

      await expect(service.uploadTestData(1, file)).rejects.toThrow(BadRequestException)
    })

    it('应该接受 application/octet-stream + .zip 扩展名', async () => {
      const file = {
        originalname: 'testdata.zip',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from(''),
      } as Express.Multer.File

      await expect(service.uploadTestData(1, file)).resolves.not.toThrow()
    })

    it('应该拒绝 .zip 扩展名但 MIME 类型不在允许列表的文件', async () => {
      const file = {
        originalname: 'testdata.zip',
        mimetype: 'image/jpeg',
        buffer: Buffer.from(''),
      } as Express.Multer.File

      await expect(service.uploadTestData(1, file)).rejects.toThrow(BadRequestException)
    })
  })

  // ─── 分页测试 ──────────────────────────────────────────────────────────────

  describe('findAll - 分页计算', () => {
    it('page=2, perPage=20 时 skip 应该为 20（不是 12）', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      await service.findAll({ page: 2, perPage: 20 }, true)

      // skip 应该是 (2-1) * 20 = 20
      expect(mockQb.skip).toHaveBeenCalledWith(20)
      expect(mockQb.take).toHaveBeenCalledWith(20)
    })

    it('page=1, perPage=10 时 skip 应该为 0', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      await service.findAll({ page: 1, perPage: 10 }, true)

      expect(mockQb.skip).toHaveBeenCalledWith(0)
    })

    it('page=3, perPage=15 时 skip 应该为 30', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      await service.findAll({ page: 3, perPage: 15 }, true)

      expect(mockQb.skip).toHaveBeenCalledWith(30)
    })
  })

  // ─── 权限过滤测试 ──────────────────────────────────────────────────────────

  describe('findAll - 权限过滤', () => {
    it('非 admin 应该添加 closed=false 过滤条件', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      await service.findAll({ page: 1, perPage: 20 }, false)

      // 非 admin 应该调用 andWhere 过滤 closed 和 restricted
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'p.closed = :closed',
        { closed: false },
      )
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'p.restricted = :restricted',
        { restricted: false },
      )
    })

    it('admin 不应该添加权限过滤条件', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      await service.findAll({ page: 1, perPage: 20 }, true)

      // admin 不应该过滤 closed/restricted
      const closedCall = mockQb.andWhere.mock.calls.find(
        (call: any[]) => call[0] === 'p.closed = :closed',
      )
      expect(closedCall).toBeUndefined()
    })
  })

  // ─── formatDisplayId 测试 ─────────────────────────────────────────────────

  describe('formatDisplayId', () => {
    it('应该返回 "P1001" 格式', () => {
      expect(service.formatDisplayId(mockProblem)).toBe('P1001')
    })

    it('应该将 prefix 转换为大写', () => {
      const problem = { ...mockProblem, prefix: 'a', logicId: 2000 }
      expect(service.formatDisplayId(problem)).toBe('A2000')
    })
  })

  // ─── findOne 缓存测试 ─────────────────────────────────────────────────────

  describe('findOne - 缓存', () => {
    it('缓存命中时应该直接返回缓存结果', async () => {
      cacheService.get = jest.fn().mockResolvedValue(mockProblem)

      const result = await service.findOne(1, true)

      expect(result).toBe(mockProblem)
      expect(problemRepo.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('缓存未命中时应该查询 DB 并写入缓存', async () => {
      cacheService.get = jest.fn().mockResolvedValue(null)
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockProblem),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      const result = await service.findOne(1, true)

      expect(result).toBe(mockProblem)
      expect(cacheService.set).toHaveBeenCalledWith(
        'problem:1:admin',
        mockProblem,
        6,
      )
    })

    it('题目不存在时应该抛出 NotFoundException', async () => {
      cacheService.get = jest.fn().mockResolvedValue(null)
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }
      problemRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)

      await expect(service.findOne(999, false)).rejects.toThrow(NotFoundException)
    })
  })
})
