import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Contest } from '../../database/entities/contest.entity'
import { ContestProblem } from '../../database/entities/contest-problem.entity'
import { ContestUser } from '../../database/entities/contest-user.entity'
import { ContestUserProblem } from '../../database/entities/contest-user-problem.entity'
import { User } from '../../database/entities/user.entity'
import { RedisService } from '../redis/redis.service'
import { ContestService } from './contest.service'

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findByIds: jest.fn(),
  findBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
})

const mockRedisService = () => ({
  zrevrange: jest.fn(),
  zscore: jest.fn(),
  del: jest.fn(),
  zadd: jest.fn(),
})

describe('ContestService', () => {
  let service: ContestService
  let contestRepo: any
  let contestUserRepo: any
  let contestUserProblemRepo: any
  let userRepo: any
  let contestProblemRepo: any
  let redisService: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContestService,
        { provide: getRepositoryToken(Contest), useFactory: mockRepo },
        { provide: getRepositoryToken(ContestProblem), useFactory: mockRepo },
        { provide: getRepositoryToken(ContestUser), useFactory: mockRepo },
        { provide: getRepositoryToken(ContestUserProblem), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: RedisService, useFactory: mockRedisService },
      ],
    }).compile()

    service = module.get<ContestService>(ContestService)
    contestRepo = module.get(getRepositoryToken(Contest))
    contestUserRepo = module.get(getRepositoryToken(ContestUser))
    contestUserProblemRepo = module.get(getRepositoryToken(ContestUserProblem))
    userRepo = module.get(getRepositoryToken(User))
    contestProblemRepo = module.get(getRepositoryToken(ContestProblem))
    redisService = module.get<RedisService>(RedisService)
  })

  // ─── getRanking 从 Redis 读测试 ──────────────────────────────────────────────

  describe('getRanking', () => {
    it('从 Redis Sorted Set 读（不查数据库的 contest 主表）', async () => {
      // 模拟 Redis 返回用户 ID 列表
      redisService.zrevrange.mockResolvedValue(['1', '2', '3'])
      redisService.zscore
        .mockResolvedValueOnce('300')
        .mockResolvedValueOnce('200')
        .mockResolvedValueOnce('100')

      // 模拟用户查询
      userRepo.findByIds.mockResolvedValue([
        { id: 1, username: 'user1', certifiedName: 'Alice' },
        { id: 2, username: 'user2', certifiedName: 'Bob' },
        { id: 3, username: 'user3', certifiedName: 'Charlie' },
      ])

      // 模拟竞赛用户统计
      contestUserRepo.find.mockResolvedValue([
        { userId: 1, accepts: 5, submits: 8 },
        { userId: 2, accepts: 4, submits: 6 },
        { userId: 3, accepts: 3, submits: 5 },
      ])

      const result = await service.getRanking(1, 1, 50)

      // 验证 Redis 被调用（不是数据库的排行榜查询）
      expect(redisService.zrevrange).toHaveBeenCalledWith('contest-rank:1', 0, 49)
      // 验证 contest 主表没有被查（只查了用户和竞赛用户）
      expect(contestRepo.findOne).not.toHaveBeenCalled()

      expect(result).toHaveLength(3)
      expect(result[0].rank).toBe(1)
      expect(result[0].username).toBe('user1')
      expect(result[0].score).toBe(300)
    })

    it('Redis 为空时返回空数组', async () => {
      redisService.zrevrange.mockResolvedValue([])

      const result = await service.getRanking(1, 1, 50)

      expect(result).toEqual([])
      expect(userRepo.findByIds).not.toHaveBeenCalled()
    })
  })

  // ─── registerUser 重复注册测试 ─────────────────────────────────────────────

  describe('registerUser', () => {
    it('重复注册抛 ConflictException', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1, name: 'Test Contest' })
      userRepo.findOne.mockResolvedValue({ id: 1, username: 'testuser' })
      contestUserRepo.findOne.mockResolvedValue({ contestId: 1, userId: 1 }) // 已注册

      await expect(service.registerUser(1, 1)).rejects.toThrow(ConflictException)
    })

    it('正常注册成功', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1, name: 'Test Contest' })
      userRepo.findOne.mockResolvedValue({ id: 1, username: 'testuser' })
      contestUserRepo.findOne.mockResolvedValue(null) // 未注册
      contestUserRepo.create.mockReturnValue({ contestId: 1, userId: 1 })
      contestUserRepo.save.mockResolvedValue({ contestId: 1, userId: 1 })

      const result = await service.registerUser(1, 1)
      expect(result).toBeDefined()
      expect(contestUserRepo.save).toHaveBeenCalled()
    })

    it('竞赛不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue(null)

      await expect(service.registerUser(999, 1)).rejects.toThrow(NotFoundException)
    })

    it('用户不存在时抛 NotFoundException', async () => {
      contestRepo.findOne.mockResolvedValue({ id: 1 })
      userRepo.findOne.mockResolvedValue(null)

      await expect(service.registerUser(1, 999)).rejects.toThrow(NotFoundException)
    })
  })
})
