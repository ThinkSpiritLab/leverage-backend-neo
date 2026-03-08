/**
 * submissions.e2e.spec.ts
 *
 * E2E tests for Submissions endpoints using real MariaDB + Redis (started by globalSetup).
 *
 * POST /submissions requires JwtAuthGuard. Rate limiting and queue tests
 * are skipped as they require pre-existing problems in the DB.
 */
import request from 'supertest'
import { INestApplication } from '@nestjs/common'
import { createTestApp } from './test-app'

describe('Submissions E2E', () => {
  let app: INestApplication
  let accessToken: string

  beforeAll(async () => {
    app = await createTestApp()

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' })
    accessToken = res.body.accessToken
  }, 60_000)

  afterAll(async () => {
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

    it.skip('TODO: rate limited after N requests — needs pre-existing problem (requires admin role fix)', async () => {
      // To enable: fix mapAuthority bug → create problem → override MAX_SUBMISSION_PER_MINUTE=1
      // 1. POST /problems → 201 (once admin role works)
      // 2. POST /submissions (problemId) → 201
      // 3. POST /submissions (problemId) → 429
    })

    it.skip('TODO: creates submission with PENDING status — needs pre-existing problem', async () => {
      // To enable: fix mapAuthority bug → create problem → submit → check status=PENDING
      // 1. POST /problems → get id
      // 2. POST /submissions { problemId: id, code: '...', language: 1 } → 201
      // 3. expect(res.body.status).toBe('PENDING')
    })
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
