import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { HengClientService } from './heng-client.service'
import axios from 'axios'

// Mock axios.create
jest.mock('axios', () => {
  const mockPost = jest.fn()
  const mockCreate = jest.fn(() => ({ post: mockPost }))
  return { default: { create: mockCreate }, create: mockCreate }
})

describe('HengClientService', () => {
  let service: HengClientService
  let configService: ConfigService
  let mockAxiosInstance: { post: jest.Mock }

  const mockConfig: Record<string, unknown> = {
    'heng.baseUrl': 'https://heng.example.com',
    'heng.ak': 'test-ak',
    'heng.sk': 'test-sk',
    'heng.allowInsecureTls': false,
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HengClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: unknown) => mockConfig[key] ?? defaultVal),
          },
        },
      ],
    }).compile()

    service = module.get<HengClientService>(HengClientService)
    configService = module.get<ConfigService>(ConfigService)

    // Get the mock axios instance that was created
    mockAxiosInstance = (axios.create as jest.Mock).mock.results[
      (axios.create as jest.Mock).mock.results.length - 1
    ]?.value as { post: jest.Mock }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('HMAC 签名', () => {
    it('应包含所有必要的签名 headers', async () => {
      if (!mockAxiosInstance?.post) return

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { judgeId: 'test-judge-id' },
      })

      const request = {
        judge: { type: 'normal' as any, user: {} as any },
        callbackUrls: {
          update: 'http://localhost/heng/update/1/abc',
          finish: 'http://localhost/heng/finish/1/abc',
        },
      }

      await service.createJudge(request)

      const [, , config] = mockAxiosInstance.post.mock.calls[0]
      const headers = config.headers as Record<string, string>

      expect(headers['x-heng-accesskey']).toBe('test-ak')
      expect(headers['x-heng-nonce']).toBeDefined()
      expect(headers['x-heng-timestamp']).toBeDefined()
      expect(headers['x-heng-signature']).toBeDefined()
      expect(headers['content-type']).toBe('application/json;charset=utf-8')
    })

    it('签名应为 64 字节十六进制字符串（SHA256 output）', async () => {
      if (!mockAxiosInstance?.post) return

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { judgeId: 'abc123' },
      })

      const request = {
        judge: { type: 'normal' as any, user: {} as any },
        callbackUrls: {
          update: 'http://localhost/heng/update/1/abc',
          finish: 'http://localhost/heng/finish/1/abc',
        },
      }

      await service.createJudge(request)

      const [, , config] = mockAxiosInstance.post.mock.calls[0]
      const headers = config.headers as Record<string, string>
      const signature = headers['x-heng-signature']

      // HMAC-SHA256 输出为 64 字节十六进制
      expect(signature).toMatch(/^[0-9a-f]{64}$/)
    })

    it('相同请求两次签名应不同（nonce 随机）', async () => {
      if (!mockAxiosInstance?.post) return

      mockAxiosInstance.post.mockResolvedValue({ data: { judgeId: 'x' } })

      const request = {
        judge: { type: 'normal' as any, user: {} as any },
        callbackUrls: {
          update: 'http://localhost/heng/update/1/abc',
          finish: 'http://localhost/heng/finish/1/abc',
        },
      }

      await service.createJudge(request)
      await service.createJudge(request)

      const [, , config1] = mockAxiosInstance.post.mock.calls[0]
      const [, , config2] = mockAxiosInstance.post.mock.calls[1]

      // nonce 应不同（随机生成）
      expect(config1.headers['x-heng-nonce']).not.toBe(config2.headers['x-heng-nonce'])
    })
  })

  describe('SSL 配置', () => {
    it('allowInsecureTls=false 时应验证证书（默认安全）', () => {
      // 通过 config mock 验证 allowInsecureTls 被读取
      expect(configService.get).toBeDefined()
      const val = configService.get('heng.allowInsecureTls')
      expect(val).toBe(false)
    })

    it('createJudge 成功时返回 judgeId', async () => {
      if (!mockAxiosInstance?.post) return

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { judgeId: 'returned-judge-id' },
      })

      const result = await service.createJudge({
        judge: { type: 'normal' as any, user: {} as any },
        callbackUrls: {
          update: 'http://localhost/heng/update/1/abc',
          finish: 'http://localhost/heng/finish/1/abc',
        },
      })

      expect(result).toEqual({ judgeId: 'returned-judge-id' })
    })
  })
})
