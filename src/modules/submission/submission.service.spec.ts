import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { getQueueToken } from '@nestjs/bull'
import { Repository } from 'typeorm'
import { SubmissionService } from './submission.service'
import { Submission } from '../../database/entities/submission.entity'
import { SubmissionMisc } from '../../database/entities/submission-misc.entity'
import { Problem } from '../../database/entities/problem.entity'
import { RedisService } from '../redis/redis.service'
import { JUDGE_TX_QUEUE } from '../queue/queue.constants'
import { Status } from '../heng/heng.types'

describe('SubmissionService', () => {
  let service: SubmissionService
  let submissionRepo: jest.Mocked<Repository<Submission>>
  let miscRepo: jest.Mocked<Repository<SubmissionMisc>>
  let problemRepo: jest.Mocked<Repository<Problem>>
  let redisService: jest.Mocked<RedisService>
  let configService: jest.Mocked<ConfigService>
  let judgeTxQueue: { add: jest.Mock }

  const mockProblem: Problem = {
    id: 1,
    prefix: 'p',
    logicId: 1001,
    title: 'Test',
    content: '',
    source: 'Leverage',
    timeLimit: 1000,
    memoryLimit: 64,
    difficulty: 1,
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

  const mockSubmission: Submission = {
    id: 42,
    userId: 1,
    user: null as any,
    problemId: 1,
    problem: mockProblem,
    language: 1,
    time: null as any,
    memory: null as any,
    misc: null as any,
    sus: null as any,
    status: Status.PENDING,
    judger: null,
    courseId: null,
    course: null as any,
    contestId: null,
    contest: null as any,
    rejudgeLogs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    submissionRepo = {
      save: jest.fn().mockResolvedValue(mockSubmission),
      findOne: jest.fn().mockResolvedValue(mockSubmission),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockSubmission], 1]),
      }),
    } as any

    miscRepo = {
      save: jest.fn().mockResolvedValue({ submissionId: 42, code: 'int main(){}' }),
      findOne: jest.fn().mockResolvedValue({ submissionId: 42, code: 'int main(){}' }),
    } as any

    problemRepo = {
      findOne: jest.fn().mockResolvedValue(mockProblem),
    } as any

    redisService = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    } as any

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: any) => {
        if (key === 'submission.maxPerMinute') return 10
        if (key === 'baseUrl') return 'http://localhost:3000'
        return defaultVal
      }),
    } as any

    judgeTxQueue = {
      add: jest.fn().mockResolvedValue({}),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionService,
        { provide: getRepositoryToken(Submission), useValue: submissionRepo },
        { provide: getRepositoryToken(SubmissionMisc), useValue: miscRepo },
        { provide: getRepositoryToken(Problem), useValue: problemRepo },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
        { provide: getQueueToken(JUDGE_TX_QUEUE), useValue: judgeTxQueue },
      ],
    }).compile()

    service = module.get<SubmissionService>(SubmissionService)
  })

  // ─── 频率限制测试 ──────────────────────────────────────────────────────────

  describe('create - 频率限制', () => {
    it('第一次提交应该通过（count=1 ≤ max=10）', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await expect(service.create(1, dto)).resolves.toBeDefined()
    })

    it('超出限制时应该抛出 429（count=11 > max=10）', async () => {
      redisService.incr = jest.fn().mockResolvedValue(11)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await expect(service.create(1, dto)).rejects.toThrow(
        new HttpException('提交过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS),
      )
    })

    it('刚好达到限制时应该通过（count=10 = max=10）', async () => {
      redisService.incr = jest.fn().mockResolvedValue(10)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await expect(service.create(1, dto)).resolves.toBeDefined()
    })

    it('count=1 时应该设置 TTL 60s', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await service.create(1, dto)

      expect(redisService.expire).toHaveBeenCalledWith('submit-throttle:1', 60)
    })

    it('count > 1 时不应该再次设置 TTL', async () => {
      redisService.incr = jest.fn().mockResolvedValue(5)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await service.create(1, dto)

      expect(redisService.expire).not.toHaveBeenCalled()
    })
  })

  // ─── 资源倍增测试 ──────────────────────────────────────────────────────────

  describe('applyLanguageBonus - 资源倍增', () => {
    it('Java（language=6）内存应该 ×5', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 6)
      expect(result.memoryLimit).toBe(320) // 64 * 5
    })

    it('Java（language=6）时间应该 ×2', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 6)
      expect(result.timeLimit).toBe(2000) // 1000 * 2
    })

    it('Kotlin（language=7）内存应该 ×5，时间应该 ×2', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 7)
      expect(result.memoryLimit).toBe(320)
      expect(result.timeLimit).toBe(2000)
    })

    it('Python3（language=9）内存应该 ×3，时间应该 ×2', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 9)
      expect(result.memoryLimit).toBe(192) // 64 * 3
      expect(result.timeLimit).toBe(2000) // 1000 * 2
    })

    it('Python2（language=8）内存应该 ×3，时间应该 ×2', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 8)
      expect(result.memoryLimit).toBe(192)
      expect(result.timeLimit).toBe(2000)
    })

    it('JavaScript（language=10）内存应该 ×3，时间应该 ×1（不变）', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 10)
      expect(result.memoryLimit).toBe(192)
      expect(result.timeLimit).toBe(1000)
    })

    it('C++（language=1）不应该有倍增', () => {
      const problem = { ...mockProblem, memoryLimit: 64, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 1)
      expect(result.memoryLimit).toBe(64)
      expect(result.timeLimit).toBe(1000)
    })

    it('Java 内存低于最小值时应该使用最小值（64MB）', () => {
      // memoryLimit=1 MB * 5 = 5 MB < minMemory 64 MB → 应该使用 64 MB
      const problem = { ...mockProblem, memoryLimit: 1, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 6)
      expect(result.memoryLimit).toBe(64) // max(5, 64)
    })

    it('内存不应超过上限 1024 MB', () => {
      const problem = { ...mockProblem, memoryLimit: 500, timeLimit: 1000 }
      const result = service.applyLanguageBonus(problem as Problem, 6)
      // 500 * 5 = 2500 MB > 1024 MB → 应该截断为 1024 MB
      expect(result.memoryLimit).toBe(1024)
    })
  })

  // ─── create 推入 BullMQ 队列测试 ──────────────────────────────────────────

  describe('create - 推入 BullMQ 队列', () => {
    it('应该推入 judge-tx 队列', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await service.create(1, dto)

      expect(judgeTxQueue.add).toHaveBeenCalledWith(
        'judge',
        expect.objectContaining({
          submissionId: 42,
          task: expect.objectContaining({
            language: 1,
            code: 'int main(){}',
          }),
        }),
      )
    })

    it('题目不存在时应该抛出 NotFoundException', async () => {
      problemRepo.findOne = jest.fn().mockResolvedValue(null)
      redisService.incr = jest.fn().mockResolvedValue(1)

      const dto = { problemId: 999, code: 'int main(){}', language: 1 }
      await expect(service.create(1, dto)).rejects.toThrow(NotFoundException)
    })

    it('创建后应该写入 SubmissionMisc（分表）', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await service.create(1, dto)

      expect(miscRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          submissionId: 42,
          code: 'int main(){}',
        }),
      )
    })
  })

  // ─── rejudge 测试 ──────────────────────────────────────────────────────────

  describe('rejudge', () => {
    it('应该重置状态为 PENDING 并推入队列', async () => {
      await service.rejudge(42)

      expect(submissionRepo.update).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ status: Status.PENDING }),
      )
      expect(judgeTxQueue.add).toHaveBeenCalledWith('judge', expect.any(Object))
    })

    it('提交不存在时应该抛出 NotFoundException', async () => {
      submissionRepo.findOne = jest.fn().mockResolvedValue(null)

      await expect(service.rejudge(999)).rejects.toThrow(NotFoundException)
    })
  })

  // ─── getStatus 测试 ────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('Redis 有缓存时应该直接返回', async () => {
      redisService.get = jest.fn().mockResolvedValue('0') // AC

      const result = await service.getStatus(42)
      expect(result).toEqual({ status: 0 })
    })

    it('Redis 无缓存时应该从 DB 读取', async () => {
      redisService.get = jest.fn().mockResolvedValue(null)
      submissionRepo.findOne = jest.fn().mockResolvedValue({
        id: 42,
        status: Status.PENDING,
      })

      const result = await service.getStatus(42)
      expect(result).toEqual({ status: Status.PENDING })
    })
  })

  // ─── create with contestId / courseId 分支 ────────────────────────────────

  describe('create - contestId / courseId 分支', () => {
    it('传入 contestId 时提交应该关联竞赛', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)
      const savedSubmission = { ...mockSubmission, contestId: 10 }
      submissionRepo.save = jest.fn().mockResolvedValue(savedSubmission)

      const dto = { problemId: 1, code: 'int main(){}', language: 1, contestId: 10 }
      const result = await service.create(1, dto)

      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ contestId: 10 }),
      )
      expect(result.contestId).toBe(10)
    })

    it('传入 courseId 时提交应该关联课程', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)
      const savedSubmission = { ...mockSubmission, courseId: 5 }
      submissionRepo.save = jest.fn().mockResolvedValue(savedSubmission)

      const dto = { problemId: 1, code: 'int main(){}', language: 1, courseId: 5 }
      const result = await service.create(1, dto)

      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: 5 }),
      )
      expect(result.courseId).toBe(5)
    })

    it('不传 contestId/courseId 时应该存为 null', async () => {
      redisService.incr = jest.fn().mockResolvedValue(1)

      const dto = { problemId: 1, code: 'int main(){}', language: 1 }
      await service.create(1, dto)

      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ contestId: null, courseId: null }),
      )
    })
  })

  // ─── rejudge - misc 不存在时抛出 NotFoundException ────────────────────────

  describe('rejudge - misc 缺失', () => {
    it('misc 不存在时应该抛出 NotFoundException', async () => {
      submissionRepo.findOne = jest.fn().mockResolvedValue({
        ...mockSubmission,
        problem: mockProblem,
      })
      miscRepo.findOne = jest.fn().mockResolvedValue(null)

      await expect(service.rejudge(42)).rejects.toThrow(NotFoundException)
    })
  })

  // ─── getStatus - 提交不存在时 ─────────────────────────────────────────────

  describe('getStatus - 提交不存在', () => {
    it('Redis 无缓存且 DB 也无记录时应该抛出 NotFoundException', async () => {
      redisService.get = jest.fn().mockResolvedValue(null)
      submissionRepo.findOne = jest.fn().mockResolvedValue(null)

      await expect(service.getStatus(999)).rejects.toThrow(NotFoundException)
    })
  })
})
