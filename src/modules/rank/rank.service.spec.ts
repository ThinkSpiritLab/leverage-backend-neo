import { Test, TestingModule } from '@nestjs/testing'
import { RankService } from './rank.service'
import { RedisService } from '../redis/redis.service'

describe('RankService', () => {
  let service: RankService
  let redisService: jest.Mocked<RedisService>

  beforeEach(async () => {
    redisService = {
      zadd: jest.fn().mockResolvedValue(1),
      zrevrange: jest.fn().mockResolvedValue([]),
      zcard: jest.fn().mockResolvedValue(0),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankService,
        { provide: RedisService, useValue: redisService },
      ],
    }).compile()

    service = module.get<RankService>(RankService)
  })

  // ─── updateContestRank ────────────────────────────────────────────────────

  describe('updateContestRank', () => {
    it('应该调用 ZADD 更新竞赛排行榜', async () => {
      await service.updateContestRank(10, 42, 3, 600)

      expect(redisService.zadd).toHaveBeenCalledWith(
        'contest-rank:10',
        expect.any(Number),
        '42',
      )
    })

    it('score 应该是 acCount * 1e9 - penaltySeconds', async () => {
      // acCount=3, penaltySeconds=600 → score = 3_000_000_000 - 600 = 2_999_999_400
      await service.updateContestRank(1, 1, 3, 600)

      const callArgs = redisService.zadd.mock.calls[0]
      const score = callArgs[1]
      expect(score).toBe(3_000_000_000 - 600)
    })

    it('AC 数越多分数越高', async () => {
      await service.updateContestRank(1, 1, 5, 0)
      const score5 = redisService.zadd.mock.calls[0][1]

      redisService.zadd.mockClear()

      await service.updateContestRank(1, 2, 3, 0)
      const score3 = redisService.zadd.mock.calls[0][1]

      expect(score5).toBeGreaterThan(score3)
    })

    it('相同 AC 数时罚时越少分数越高', async () => {
      await service.updateContestRank(1, 1, 3, 100)
      const scoreLight = redisService.zadd.mock.calls[0][1]

      redisService.zadd.mockClear()

      await service.updateContestRank(1, 2, 3, 1000)
      const scoreHeavy = redisService.zadd.mock.calls[0][1]

      expect(scoreLight).toBeGreaterThan(scoreHeavy)
    })

    it('0 题 0 罚时 score 应为 0', async () => {
      await service.updateContestRank(1, 1, 0, 0)
      const score = redisService.zadd.mock.calls[0][1]
      expect(score).toBe(0)
    })
  })

  // ─── updateCourseRank ─────────────────────────────────────────────────────

  describe('updateCourseRank', () => {
    it('应该调用 ZADD 更新课程排行榜', async () => {
      await service.updateCourseRank(5, 99, 2, 300)

      expect(redisService.zadd).toHaveBeenCalledWith(
        'course-rank:5',
        expect.any(Number),
        '99',
      )
    })

    it('score 编码与竞赛相同', async () => {
      await service.updateCourseRank(1, 1, 2, 300)
      const score = redisService.zadd.mock.calls[0][1]
      expect(score).toBe(2_000_000_000 - 300)
    })
  })
})
