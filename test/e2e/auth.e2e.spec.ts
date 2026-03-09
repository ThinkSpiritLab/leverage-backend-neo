/**
 * auth.e2e.spec.ts
 *
 * E2E tests for Auth endpoints using real MariaDB + Redis (started by globalSetup).
 *
 * Default sa account created by InitModule (SKIP_INIT=false):
 *   username: 'admin' (INIT_SA_USERNAME default)
 *   password: 'Admin@123456' (INIT_SA_PASSWORD default)
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';

describe('Auth E2E', () => {
  let app: INestApplication;
  // Login once in top-level beforeAll to avoid hitting per-route throttle limit
  let sharedAccessToken: string;
  let sharedRefreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' })
      .expect(200);

    sharedAccessToken = res.body.accessToken;
    sharedRefreshToken = res.body.refreshToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should login with default sa credentials and return tokens', async () => {
      // InitModule creates user: username=admin, password=Admin@123456, authority=sa
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'Admin@123456' })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(typeof response.body.accessToken).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');
    });

    it('should reject invalid credentials with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'wrongpass' })
        .expect(401);
    });

    it('should reject non-existent user with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'somepass' })
        .expect(401);
    });

    it('should reject missing credentials with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should issue a new access token with a valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: sharedRefreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('should return 401 for an invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'not.a.valid.token' })
        .expect(401);
    });

    it('should return 400 for missing refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  describe('GET /auth/profile', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('should return profile with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${sharedAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('sub');
      expect(res.body).toHaveProperty('username', 'admin');
    });
  });
});
