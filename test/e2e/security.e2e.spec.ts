/**
 * security.e2e.spec.ts
 *
 * Security tests — verify that high-risk endpoints enforce proper authentication
 * and authorization. Each test covers one of two cases:
 *   1. No auth header → 401 Unauthorized
 *   2. Valid user token (role=user) → 403 Forbidden
 *
 * Uses the same testcontainers setup as other e2e specs (global-setup.ts).
 * The default InitModule sa user (admin/Admin@123456) can create regular users
 * for 403 scenarios.
 */
import request from 'supertest'
import { INestApplication } from '@nestjs/common'
import { createTestApp } from './test-app'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Login with given credentials and return the access token */
async function login(
  app: INestApplication,
  username: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password })
    .expect(200)
  return res.body.accessToken as string
}

/** Create a regular user and return their access token */
async function createRegularUser(
  app: INestApplication,
  adminToken: string,
  suffix: string,
): Promise<string> {
  const username = `sec_test_user_${suffix}`
  const password = 'User@123456'
  await request(app.getHttpServer())
    .post('/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username, password, authority: 'user' })
  return login(app, username, password)
}

// ─── test suite ─────────────────────────────────────────────────────────────

describe('Security - Unauthorized / Forbidden access', () => {
  let app: INestApplication
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    app = await createTestApp()

    // Get SA/admin token from default InitModule account
    adminToken = await login(app, 'admin', 'Admin@123456')

    // Create and login as a regular user for 403 scenarios
    userToken = await createRegularUser(app, adminToken, 'sec01')
  }, 90_000)

  afterAll(async () => {
    await app.close()
  })

  // ─── Submission: sus-* (plagiarism detection — must be admin) ──────────────

  describe('GET /submissions/sus-union (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/submissions/sus-union').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/submissions/sus-union')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /submissions/sus-recent (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/submissions/sus-recent').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/submissions/sus-recent')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /submissions/sus-xlsx (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/submissions/sus-xlsx').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/submissions/sus-xlsx')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /submissions/sus/:hashsum (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/submissions/sus/abc123').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/submissions/sus/abc123')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('PUT /submissions/sus-checked/:id (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).put('/submissions/sus-checked/1').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .put('/submissions/sus-checked/1')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('POST /submissions/sus-test (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/submissions/sus-test')
        .send({ code: 'int main(){}' })
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/submissions/sus-test')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'int main(){}' })
        .expect(403))
  })

  // ─── Submission: rejudge (must be admin) ───────────────────────────────────

  describe('POST /submissions/batch-rejudge (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/submissions/batch-rejudge')
        .send({})
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/submissions/batch-rejudge')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(403))
  })

  describe('POST /submissions/rejudge-log (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/submissions/rejudge-log')
        .send({})
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/submissions/rejudge-log')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(403))
  })

  describe('POST /submissions/:id/rejudge (admin only — fixed from supervisor)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/submissions/999/rejudge')
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/submissions/999/rejudge')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  // ─── Submission: code-zip (admin only) ────────────────────────────────────

  describe('GET /submissions/code-zip (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/submissions/code-zip').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/submissions/code-zip')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  // ─── Problem: import-fps (admin only) ─────────────────────────────────────

  describe('POST /problems/import-fps (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/problems/import-fps')
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/problems/import-fps')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('POST /problems/batch-zip-hash (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/problems/batch-zip-hash')
        .send({ problemIds: [] })
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/problems/batch-zip-hash')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ problemIds: [] })
        .expect(403))
  })

  describe('GET /problems/manage-partial (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/problems/manage-partial').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/problems/manage-partial')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /problems/next-id (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/problems/next-id?prefix=p').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/problems/next-id?prefix=p')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  // ─── Transmit: all endpoints must be admin ────────────────────────────────

  describe('GET /transmit/queue-status (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/transmit/queue-status').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/transmit/queue-status')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /transmit/judgers (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/transmit/judgers').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/transmit/judgers')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /transmit/refresh-test-files (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/transmit/refresh-test-files').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/transmit/refresh-test-files')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  describe('GET /transmit/rebuild-rank-log (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).get('/transmit/rebuild-rank-log').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .get('/transmit/rebuild-rank-log')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  // ─── User: admin-only operations ─────────────────────────────────────────

  describe('POST /users (create user — admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/users')
        .send({ username: 'x', password: 'X@123456', authority: 'user' })
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ username: 'x', password: 'X@123456', authority: 'user' })
        .expect(403))
  })

  describe('POST /users/import (batch import — admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/users/import')
        .send({ users: [] })
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/users/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ users: [] })
        .expect(403))
  })

  describe('DELETE /users/:id (delete user — admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).delete('/users/999').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .delete('/users/999')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  // ─── Compete: admin-only game management ─────────────────────────────────

  describe('POST /compete/games (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/compete/games')
        .send({ name: 'test', type: 'bot' })
        .expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .post('/compete/games')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'test', type: 'bot' })
        .expect(403))
  })

  describe('DELETE /compete/games/:id (admin only)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer()).delete('/compete/games/999').expect(401))

    it('with user token → 403', () =>
      request(app.getHttpServer())
        .delete('/compete/games/999')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403))
  })

  // ─── Protected routes: require login but not admin ────────────────────────

  describe('POST /submissions (create submission — login required)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/submissions')
        .send({ problemId: 1, code: 'int main(){}', language: 'cpp' })
        .expect(401))
  })

  describe('POST /compete/rooms (create room — login required)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .post('/compete/rooms')
        .send({ gameId: 1 })
        .expect(401))
  })

  describe('GET /submissions/user-problem-status (login required)', () => {
    it('without auth → 401', () =>
      request(app.getHttpServer())
        .get('/submissions/user-problem-status?userId=1&problemId=1')
        .expect(401))
  })
})
