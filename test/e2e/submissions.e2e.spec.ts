/**
 * submissions.e2e.spec.ts
 *
 * E2E tests for Submissions endpoints using real MariaDB + Redis (started by globalSetup).
 *
 * POST /submissions requires JwtAuthGuard.
 * The default InitModule sa user (admin/Admin@123456) has authority='sa' which maps to
 * JWT role='sa' (weight=0), satisfying @Roles('admin') (weight=1) and above.
 *
 * Execution goes through the internal worker; no external HTTP judge or callback.
 *
 * MAX_SUBMISSION_PER_MINUTE=1 is set in global-setup.ts (first submit succeeds, second → 429).
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { RedisService } from '../../src/modules/redis/redis.service';
import { Status } from '../../src/modules/judge-runtime/judge-status';

/** 从 JWT accessToken 解析 userId */
function parseUserId(token: string): number {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  );
  return payload.sub as number;
}

describe('Submissions E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let redisService: RedisService;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = app.get(RedisService);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' });
    accessToken = res.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /submissions', () => {
    it('should return 200 with empty list on fresh DB', async () => {
      const res = await request(app.getHttpServer())
        .get('/submissions')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('POST /submissions', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/submissions')
        .send({ problemId: 1, code: 'print("hello")', language: 1 })
        .expect(401);
    });

    it('should return 404 when problem does not exist', async () => {
      // 先清理速率计数，保证此请求不因速率限制失败
      const userId = parseUserId(accessToken);
      await redisService.del(`submit-throttle:${userId}`);

      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ problemId: 99999, code: 'print("hello")', language: 1 })
        .expect(404);
    });

    it('should return 400 for invalid body (missing required fields)', async () => {
      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('rate limited after 1 request per minute (MAX_SUBMISSION_PER_MINUTE=1)', async () => {
      const userId = parseUserId(accessToken);
      // 清理速率计数器
      await redisService.del(`submit-throttle:${userId}`);

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
        .expect(201);
      const problemId = problemRes.body.id;

      // 第一次提交：成功（count=1, 1>1 = false → 201）
      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ problemId, code: 'print(1)', language: 1 })
        .expect(201);


      // 第二次提交：触发速率限制（count=2, 2>1 = true → 429）
      await request(app.getHttpServer())
        .post('/submissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ problemId, code: 'print(1)', language: 1 })
        .expect(429);


    }, 20_000);


  });

  describe('GET /submissions/:id', () => {
    it('should return 404 for non-existent submission', async () => {
      await request(app.getHttpServer()).get('/submissions/99999').expect(404);
    });

    it('should return 400 for invalid id format', async () => {
      await request(app.getHttpServer())
        .get('/submissions/not-a-number')
        .expect(400);
    });
  });
});
