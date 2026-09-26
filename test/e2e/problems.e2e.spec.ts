/**
 * problems.e2e.spec.ts
 *
 * E2E tests for Problems endpoints using real MariaDB + Redis (started by globalSetup).
 *
 * NOTE: GET /problems is a public endpoint (no auth required).
 * POST /problems requires an admin role. The bootstrap SA maps to `sa`,
 * which is permitted by the role guard.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';

describe('Problems E2E', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Login to get the bootstrap SA token for authenticated tests.
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' });
    accessToken = res.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /problems', () => {
    it('should return 200 without auth (public endpoint)', async () => {
      const res = await request(app.getHttpServer())
        .get('/problems')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('should return paginated results with query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/problems?page=1&perPage=10')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });

    it('should also work with a valid auth token', async () => {
      const res = await request(app.getHttpServer())
        .get('/problems')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('POST /problems', () => {
    it('admin can create', async () => {
      const res = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Problem',
          content: '# Test\nA test problem.',
          timeLimit: 1000,
          memoryLimit: 256,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('title', 'Test Problem');
    });
  });

  describe('GET /problems/:id', () => {
    it('should return 404 for non-existent problem', async () => {
      await request(app.getHttpServer()).get('/problems/99999').expect(404);
    });

    it('should return 400 for invalid id format', async () => {
      await request(app.getHttpServer())
        .get('/problems/not-a-number')
        .expect(400);
    });
  });
});
