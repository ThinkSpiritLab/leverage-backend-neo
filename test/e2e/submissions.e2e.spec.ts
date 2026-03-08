/**
 * submissions.e2e.spec.ts
 *
 * E2E tests for Submissions endpoints using real MariaDB + Redis (started by globalSetup).
 *
 * POST /submissions requires JwtAuthGuard.
 * The default InitModule sa user (admin/Admin@123456) has authority='sa' which maps to
 * JWT role='sa' (weight=0), satisfying @Roles('admin') (weight=1) and above.
 *
 * Heng HTTP calls are intercepted by nock (HENG_BASE_URL=http://mock-heng.test).
 * JudgeTxWorker generates its own judgeId (randomBytes), so we poll Redis to get it.
 *
 * MAX_SUBMISSION_PER_MINUTE=1 is set in global-setup.ts (first submit succeeds, second → 429).
 */
import request from 'supertest'
import { INestApplication } from '@nestjs/common'
import nock from 'nock'
import { createTestApp } from './test-app'
import { RedisService } from '../../src/modules/redis/redis.service'
import { JudgeResultKind, Status } from '../../src/modules/heng/heng.types'

/** Mock heng 的 baseURL（与 global-setup.ts HENG_BASE_URL 一致） */
const MOCK_HENG_URL = 'http://mock-heng.test'

/** 从 JWT accessToken 解析 userId */
function parseUserId(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  return payload.sub as number
}

/** 等待 Redis set 中出现第一个成员，返回该成员；超时则返回 undefined */
async function pollRedisSet(
  redisService: RedisService,
  key: string,
  maxMs = 8000,
  intervalMs = 300,
): Promise<string | undefined> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const members = await redisService.smembers(key)
    if (members.length > 0) return members[0]
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return undefined
}

describe('Submissions E2E', () => {
  let app: INestApplication
  let accessToken: string
  let redisService: RedisService

  beforeAll(async () => {
    // 设置持久化 nock 拦截：所有对 mock-heng.test POST /c/v1/judges 的请求都返回 200
    // 使用 persist() 避免单次消费问题（JudgeTxWorker 不管哪个 job 都能成功调用）
    nock(MOCK_HENG_URL)
      .post('/c/v1/judges')
      .reply(200, { judgeId: 'mock-judge-response-id' })
      .persist()

    // 允许 localhost/127.0.0.1 通过（supertest 请求），block 其他（由 nock 处理）
    nock.enableNetConnect(/127\.0\.0\.1|localhost/)

    app = await createTestApp()
    redisService = app.get(RedisService)

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' })
    accessToken = res.body.accessToken
  }, 60_000)

  afterAll(async () => {
    nock.cleanAll()
    nock.enableNetConnect()
    await app.close()
  })

  describe('GET /submissions', () => {
    it('should return 200 with empty list on fresh DB', async () => {
      const res = await request(app.getHttpServer())
        .get('/submissions')
        .expect(200)

      expect(res.body).toHaveProperty('items')
      expect(res.body).toHaveProperty('total')
      expect(Array.isArray(res.body.items)).toBe(true)
    })
  })

  describe('POST /submissions', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/submissions')
        .send({ problemId: 1, code: 'print("hello")', language: 1 })
        .expect(401)
    })

    it('should return 404 when problem does not exist', async () => {
      // 先清理速率计数，保证此请求不因速率限制失败
      const userId = parseUserId(accessToken)
      await redisService.del(`submit-throttle:${userId}`)

      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ problemId: 99999, code: 'print("hello")', language: 1 })
        .expect(404)
    })

    it('should return 400 for invalid body (missing required fields)', async () => {
      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400)
    })

    it('rate limited after 1 request per minute (MAX_SUBMISSION_PER_MINUTE=1)', async () => {
      const userId = parseUserId(accessToken)
      // 清理速率计数器
      await redisService.del(`submit-throttle:${userId}`)

      // 创建题目（sa role 满足 @Roles('admin')）
      const problemRes = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Rate Limit Test Problem',
          content: '# Rate Limit\nTest.',
          source: 'Test',
          timeLimit: 1000,
          memoryLimit: 256,
        })
        .expect(201)
      const problemId = problemRes.body.id

      // 第一次提交：成功（count=1, 1>1 = false → 201）
      const sub1Res = await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ problemId, code: 'print(1)', language: 1 })
        .expect(201)

      const sub1Id = sub1Res.body.id

      // 第二次提交：触发速率限制（count=2, 2>1 = true → 429）
      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ problemId, code: 'print(1)', language: 1 })
        .expect(429)

      // 等待 JudgeTxWorker 处理 sub1（确保 heng nock 已被消费），再继续
      // 轮询 Redis judge-ids，最多等 5 秒
      await pollRedisSet(redisService, `judge-ids:${sub1Id}`, 5000)
    }, 20_000)

    it('creates submission with PENDING status, then AC via mock heng callback', async () => {
      const userId = parseUserId(accessToken)
      // 清理速率计数器（上一个测试可能已使用）
      await redisService.del(`submit-throttle:${userId}`)

      // Step 1: 创建题目
      const problemRes = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Full E2E Judge Test Problem',
          content: '# A+B Problem\nGiven A and B, output A+B.',
          source: 'Test',
          timeLimit: 1000,
          memoryLimit: 256,
        })
        .expect(201)
      const problemId = problemRes.body.id
      expect(problemId).toBeDefined()

      // Step 2: 提交代码 → 201，状态为 PENDING
      // nock 持久化拦截已在 beforeAll 设置，JudgeTxWorker 可直接使用
      const submitRes = await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          problemId,
          code: '#include<stdio.h>\nint main(){int a,b;scanf("%d%d",&a,&b);printf("%d",a+b);}',
          language: 2, // C
        })
        .expect(201)

      const submissionId: number = submitRes.body.id
      expect(submissionId).toBeDefined()
      expect(submitRes.body.status).toBe(Status.PENDING) // 9

      // Step 3: 等待 JudgeTxWorker 处理（轮询 Redis 获取 judgeId）
      // JudgeTxWorker 会 SADD judge-ids:<submissionId> <judgeId>（在 heng 调用之前）
      const judgeId = await pollRedisSet(redisService, `judge-ids:${submissionId}`, 8000, 300)
      expect(judgeId).toBeDefined()

      // Step 4: 模拟 heng 回调 POST /heng/finish/:submissionId/:judgeId
      const finishPayload = {
        cases: [
          { kind: JudgeResultKind.Accepted, time: 15, memory: 2048 },
        ],
        judger: 'mock-judger-001',
      }
      await request(app.getHttpServer())
        .post(`/heng/finish/${submissionId}/${judgeId}`)
        .send(finishPayload)
        .expect(200)

      // Step 5: 等待 JudgeRxWorker 处理（写入 DB）
      await new Promise((r) => setTimeout(r, 2000))

      // Step 6: GET /submissions/:id → 验证最终状态为 AC (0)
      const finalRes = await request(app.getHttpServer())
        .get(`/submissions/${submissionId}`)
        .expect(200)

      expect(finalRes.body.status).toBe(Status.AC) // 0
    }, 30_000)
  })

  describe('GET /submissions/:id', () => {
    it('should return 404 for non-existent submission', async () => {
      await request(app.getHttpServer())
        .get('/submissions/99999')
        .expect(404)
    })

    it('should return 400 for invalid id format', async () => {
      await request(app.getHttpServer())
        .get('/submissions/not-a-number')
        .expect(400)
    })
  })
})
