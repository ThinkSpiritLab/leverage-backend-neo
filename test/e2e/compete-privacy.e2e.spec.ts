import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';

/** Real HTTP/auth/ORM boundary; no external judge or submitted code is executed. */
describe('Bot read privacy and owner versioning', () => {
  let app: INestApplication;
  let owner: string;
  let viewer: string;
  let privateId: number;
  let publicId: number;
  let webhookId: number;
  let gameId: number;
  const login = async (username: string, password: string) => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ username, password }).expect(200);
    return response.body.accessToken as string;
  };
  beforeAll(async () => {
    app = await createTestApp();
    const admin = await login('admin', 'Admin@123456');
    for (const name of ['privacy_owner', 'privacy_viewer']) {
      await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${admin}`)
        .send({ username: name, password: 'Fixture@123456', authority: 'user' }).expect(201);
    }
    owner = await login('privacy_owner', 'Fixture@123456');
    viewer = await login('privacy_viewer', 'Fixture@123456');
    const game = await request(app.getHttpServer()).post('/compete/games').set('Authorization', `Bearer ${admin}`)
      .send({ title: 'Privacy fixture', description: '', timeLimit: 1000, memoryLimit: 256, gamerQuantity: 2, judgerLanguage: 'python', judgerCode: 'print(1)' }).expect(201);
    gameId = game.body.id;
    const create = async (body: object) => (await request(app.getHttpServer()).post('/compete/gamers')
      .set('Authorization', `Bearer ${owner}`).send({ gameId, title: 'Privacy Bot', language: 'python', ...body }).expect(201)).body.id as number;
    privateId = await create({ type: 'code', opensource: false, code: 'private-source-marker' });
    publicId = await create({ type: 'code', opensource: true, code: 'public-source-marker' });
    webhookId = await create({ type: 'webhook', language: 'webhook', webhookUrl: 'https://example.invalid/bot', webhookSecret: 'fixture-webhook-secret' });
  }, 90_000);
  afterAll(async () => { await app?.close(); });

  it('keeps metadata public while withholding private code from anonymous and other users', async () => {
    for (const token of [null, viewer]) {
      let query = request(app.getHttpServer()).get(`/compete/gamers/${privateId}`);
      if (token) query = query.set('Authorization', `Bearer ${token}`);
      const response = await query.expect(200);
      expect(response.body.id).toBe(privateId);
      expect(response.body.code).toBeUndefined();
      expect(response.body.user?.email).toBeUndefined();
      expect(response.body.user?.studentId).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('private-source-marker');
    }
  });
  it('serves private code to its owner and public code anonymously', async () => {
    const mine = await request(app.getHttpServer()).get(`/compete/gamers/${privateId}`).set('Authorization', `Bearer ${owner}`).expect(200);
    expect(mine.body.code).toBe('private-source-marker');
    const shared = await request(app.getHttpServer()).get(`/compete/gamers/${publicId}`).expect(200);
    expect(shared.body.code).toBe('public-source-marker');
  });
  it('never includes webhook secrets in public detail or lists', async () => {
    const detail = await request(app.getHttpServer()).get(`/compete/gamers/${webhookId}`).expect(200);
    const list = await request(app.getHttpServer()).get(`/compete/gamers?gameId=${gameId}`).expect(200);
    expect(JSON.stringify([detail.body, list.body])).not.toContain('fixture-webhook-secret');
  });
  it('does not silently downgrade an invalid credential to public access', async () => {
    await request(app.getHttpServer()).get(`/compete/gamers/${publicId}`).set('Authorization', 'Bearer invalid-fixture').expect(401);
  });
  it('preserves private source when the owner creates a renamed version', async () => {
    const changed = await request(app.getHttpServer()).patch(`/compete/gamers/${privateId}`)
      .set('Authorization', `Bearer ${owner}`).send({ title: 'Renamed version' }).expect(200);
    const updated = await request(app.getHttpServer()).get(`/compete/gamers/${changed.body.id}`)
      .set('Authorization', `Bearer ${owner}`).expect(200);
    expect(updated.body.code).toBe('private-source-marker');
    expect(updated.body.opensource).toBe(false);
    expect(updated.body.id).not.toBe(privateId);
  });
});
