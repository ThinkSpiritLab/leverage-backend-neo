import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { Job } from 'bull'
import { JudgeTxWorker } from './judge-tx.worker'
import { HengClientService } from '../heng-client.service'
import { RedisService } from '../../redis/redis.service'
import {
  HengJudgeType,
  HengTestPolicy,
  JudgeTxPayload,
  CreateJudgeRequest,
} from '../heng.types'

// ─── Mock crypto to control judgeId ─────────────────────────────────────────

const MOCK_JUDGE_ID = 'aabbccddeeff00112233445566778899'

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto')
  return {
    ...actual,
    randomBytes: jest.fn(() => Buffer.from(MOCK_JUDGE_ID, 'hex')),
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockHengClient = {
  createJudge: jest.fn(),
}

const mockRedisService = {
  sadd: jest.fn(),
  srem: jest.fn(),
}

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
    if (key === 'baseUrl') return 'http://testserver:3000'
    return defaultVal
  }),
}

/** 构建一个最小化的 JudgeTxPayload */
function buildPayload(overrides: Partial<JudgeTxPayload> = {}): JudgeTxPayload {
  const base: JudgeTxPayload = {
    submissionId: 42,
    task: {
      judge: {
        type: HengJudgeType.Normal,
        user: {
          source: { type: 'direct', content: 'int main(){}' },
          environment: {
            language: 'cpp17',
            system: 'Linux',
            arch: 'x64',
            options: {},
          },
          limit: {
            runtime: { memory: 256 * 1024 * 1024, cpuTime: 1000, output: 64 * 1024 * 1024 },
            compiler: { memory: 256 * 1024 * 1024, cpuTime: 30000, output: 64 * 1024 * 1024, message: 1024 * 1024 },
          },
        },
      },
      test: {
        cases: [{ input: '1\n', output: '1\n' }],
        policy: HengTestPolicy.All,
      },
    },
    ...overrides,
  }
  return base
}

/** 构建一个最小化的 BullMQ Job mock */
function buildJob(data: JudgeTxPayload): Job<JudgeTxPayload> {
  return {
    id: 'job-1',
    data,
    opts: {},
    queue: {} as any,
    attemptsMade: 0,
  } as unknown as Job<JudgeTxPayload>
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JudgeTxWorker', () => {
  let worker: JudgeTxWorker

  beforeEach(async () => {
    jest.clearAllMocks()

    // Default happy-path mock
    mockHengClient.createJudge.mockResolvedValue({ judgeId: 'heng-judge-001' })
    mockRedisService.sadd.mockResolvedValue(1)
    mockRedisService.srem.mockResolvedValue(1)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JudgeTxWorker,
        { provide: HengClientService, useValue: mockHengClient },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    worker = module.get<JudgeTxWorker>(JudgeTxWorker)
  })

  // ─── 正常流程 ────────────────────────────────────────────────────────────

  describe('正常流程', () => {
    it('成功提交：sadd judgeId 后调用 hengClient.createJudge', async () => {
      const payload = buildPayload()
      const job = buildJob(payload)

      await worker.handle(job)

      // 1. Redis SADD 应先于 createJudge 被调用
      expect(mockRedisService.sadd).toHaveBeenCalledWith(
        `judge-ids:${payload.submissionId}`,
        MOCK_JUDGE_ID,
      )

      // 2. createJudge 应被调用一次
      expect(mockHengClient.createJudge).toHaveBeenCalledTimes(1)
    })

    it('createJudge 调用时包含正确的 callbackUrls', async () => {
      const payload = buildPayload({ submissionId: 99 })
      const job = buildJob(payload)

      await worker.handle(job)

      const callArg: CreateJudgeRequest = mockHengClient.createJudge.mock.calls[0][0]
      expect(callArg.callbackUrls).toEqual({
        update: `http://testserver:3000/heng/update/99/${MOCK_JUDGE_ID}`,
        finish: `http://testserver:3000/heng/finish/99/${MOCK_JUDGE_ID}`,
      })
    })

    it('createJudge 调用时 task 字段被透传', async () => {
      const payload = buildPayload()
      const job = buildJob(payload)

      await worker.handle(job)

      const callArg: CreateJudgeRequest = mockHengClient.createJudge.mock.calls[0][0]
      expect(callArg.judge).toEqual(payload.task.judge)
      expect(callArg.test).toEqual(payload.task.test)
    })

    it('成功时 srem 不应被调用（无需清理 judgeId）', async () => {
      const payload = buildPayload()
      const job = buildJob(payload)

      await worker.handle(job)

      expect(mockRedisService.srem).not.toHaveBeenCalled()
    })

    it('configService baseUrl 默认值为 http://localhost:3000', async () => {
      // 重新创建 module，configService 返回 default
      const configWithDefault = {
        get: jest.fn().mockImplementation((_key: string, defaultVal: any) => defaultVal),
      }

      const moduleWithDefault: TestingModule = await Test.createTestingModule({
        providers: [
          JudgeTxWorker,
          { provide: HengClientService, useValue: mockHengClient },
          { provide: RedisService, useValue: mockRedisService },
          { provide: ConfigService, useValue: configWithDefault },
        ],
      }).compile()

      const workerWithDefault = moduleWithDefault.get<JudgeTxWorker>(JudgeTxWorker)
      const payload = buildPayload({ submissionId: 1 })
      const job = buildJob(payload)

      await workerWithDefault.handle(job)

      const callArg: CreateJudgeRequest = mockHengClient.createJudge.mock.calls[0][0]
      expect(callArg.callbackUrls.update).toContain('http://localhost:3000')
    })
  })

  // ─── heng 连接失败 ───────────────────────────────────────────────────────

  describe('heng 连接失败', () => {
    it('createJudge 抛出异常时，srem 清理 judgeId', async () => {
      const error = new Error('ECONNREFUSED: heng unreachable')
      mockHengClient.createJudge.mockRejectedValue(error)

      const payload = buildPayload()
      const job = buildJob(payload)

      await expect(worker.handle(job)).rejects.toThrow('ECONNREFUSED')

      // 失败后必须清理 judgeId
      expect(mockRedisService.srem).toHaveBeenCalledWith(
        `judge-ids:${payload.submissionId}`,
        MOCK_JUDGE_ID,
      )
    })

    it('createJudge 异常后重新 throw，让 BullMQ 重试', async () => {
      const error = new Error('timeout')
      mockHengClient.createJudge.mockRejectedValue(error)

      const payload = buildPayload()
      const job = buildJob(payload)

      await expect(worker.handle(job)).rejects.toThrow('timeout')
    })

    it('sadd 先于 createJudge 调用（即使后续失败）', async () => {
      const callOrder: string[] = []
      mockRedisService.sadd.mockImplementation(async () => {
        callOrder.push('sadd')
        return 1
      })
      mockHengClient.createJudge.mockImplementation(async () => {
        callOrder.push('createJudge')
        throw new Error('fail')
      })

      const payload = buildPayload()
      const job = buildJob(payload)

      await expect(worker.handle(job)).rejects.toThrow()

      expect(callOrder[0]).toBe('sadd')
      expect(callOrder[1]).toBe('createJudge')
    })
  })

  // ─── 参数正确传递 ────────────────────────────────────────────────────────

  describe('参数传递验证', () => {
    it('judge 字段（含 timeLimit/memoryLimit）正确透传', async () => {
      const customLimit = {
        runtime: { memory: 512 * 1024 * 1024, cpuTime: 2000, output: 128 * 1024 * 1024 },
        compiler: { memory: 512 * 1024 * 1024, cpuTime: 60000, output: 128 * 1024 * 1024, message: 2 * 1024 * 1024 },
      }
      const payload = buildPayload({
        task: {
          judge: {
            type: HengJudgeType.Normal,
            user: {
              source: { type: 'direct', content: 'code' },
              environment: { language: 'java', system: 'Linux', arch: 'x64', options: {} },
              limit: customLimit,
            },
          },
        },
      })
      const job = buildJob(payload)

      await worker.handle(job)

      const callArg: CreateJudgeRequest = mockHengClient.createJudge.mock.calls[0][0]
      expect((callArg.judge as any).user.limit).toEqual(customLimit)
    })

    it('data 字段（测试数据文件）正确透传', async () => {
      const payload = buildPayload({
        task: {
          data: { type: 'url', url: 'https://cdn.example.com/testdata.zip' },
          judge: buildPayload().task.judge,
        },
      })
      const job = buildJob(payload)

      await worker.handle(job)

      const callArg: CreateJudgeRequest = mockHengClient.createJudge.mock.calls[0][0]
      expect(callArg.data).toEqual(payload.task.data)
    })

    it('submissionId 不同时生成不同的 callback URL 路径', async () => {
      const ids = [1, 100, 99999]
      for (const submissionId of ids) {
        jest.clearAllMocks()
        mockHengClient.createJudge.mockResolvedValue({ judgeId: 'x' })
        mockRedisService.sadd.mockResolvedValue(1)

        const payload = buildPayload({ submissionId })
        const job = buildJob(payload)
        await worker.handle(job)

        const callArg: CreateJudgeRequest = mockHengClient.createJudge.mock.calls[0][0]
        expect(callArg.callbackUrls.finish).toContain(`/${submissionId}/`)
        expect(callArg.callbackUrls.update).toContain(`/${submissionId}/`)
      }
    })
  })
})
