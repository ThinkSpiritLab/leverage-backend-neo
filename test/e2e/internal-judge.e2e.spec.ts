import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { zipCases } from './zip-cases';
import { MAX_TESTCASE_ZIP_BYTES } from '../../src/modules/problem/testcase-archive';
import { createTestApp } from './test-app';
import { Status } from '../../src/modules/judge-runtime/judge-status';
import { RedisService } from '../../src/modules/redis/redis.service';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(get: () => Promise<T>, accept: (value: T) => boolean, ms = 30000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await get();
    if (accept(value)) return value;
    await pause(150);
  }
  throw new Error('Internal judge did not finish within the test budget');
}

describe('isolated internal judge HTTP → worker → SQL', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let token: string;
  let testRoot: string;
  let previousRoot: string | undefined;

  beforeAll(async () => {
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'leverage-judge-e2e-'));
    previousRoot = process.env.TEST_CASES_PATH;
    process.env.TEST_CASES_PATH = testRoot;
    app = await createTestApp();
    const login = await request(app.getHttpServer()).post('/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' }).expect(200);
    token = login.body.accessToken;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.TEST_CASES_PATH;
    else process.env.TEST_CASES_PATH = previousRoot;
    if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('grades OJ source through the internal container and persists counters', async () => {
    const created = await request(app.getHttpServer()).post('/problems').set(auth())
      .send({ title: 'Runtime sum', content: 'a+b', source: 'fixture', timeLimit: 1000, memoryLimit: 64 }).expect(201);
    const id = created.body.id as number;
    const db = app.get(DataSource);
    const zip = await zipCases({ '1.in': '2 3\n', '1.out': '5\n' });
    const uploaded = await request(app.getHttpServer()).post(`/problems/${id}/test-data`).set(auth())
      .attach('file', zip, { filename: 'cases.zip', contentType: 'application/zip' });
    expect({ status: uploaded.status, message: uploaded.body?.message }).toEqual({ status: 201, message: '测试数据上传成功' });
    const listed = await request(app.getHttpServer()).get(`/problems/${id}/test-cases`).set(auth()).expect(200);
    expect(listed.body.sort()).toEqual(['1.in', '1.out']);
    const [stored] = await db.query('SELECT cases FROM problem WHERE id = ?', [id]);
    expect(Number(stored.cases)).toBe(1);
    await request(app.getHttpServer()).post(`/problems/${id}/test-data`)
      .attach('file', zip, { filename: 'cases.zip', contentType: 'application/zip' }).expect(401);
    const replacement = await zipCases({ '1.in': '2 3\n', '1.out': '5\n', '2.in': '4 5\n', '2.out': '9\n' });
    await request(app.getHttpServer()).post(`/problems/${id}/test-data`).set(auth())
      .attach('file', replacement, { filename: 'cases.zip', contentType: 'application/zip' }).expect(201);
    await request(app.getHttpServer()).post(`/problems/${id}/test-data`).set(auth())
      .attach('file', Buffer.from('not a zip'), { filename: 'broken.zip', contentType: 'application/zip' }).expect(400);
    await request(app.getHttpServer()).post(`/problems/${id}/test-data`).set(auth()).expect(400);
    const oversized = await request(app.getHttpServer()).post(`/problems/${id}/test-data`).set(auth())
      .attach('file', Buffer.alloc(MAX_TESTCASE_ZIP_BYTES + 1),
        { filename: 'oversized.zip', contentType: 'application/zip' });
    expect([400, 413]).toContain(oversized.status);
    const current = await request(app.getHttpServer()).get(`/problems/${id}/test-cases`).set(auth()).expect(200);
    expect(current.body.sort()).toEqual(['1.in', '1.out', '2.in', '2.out']);
    const [updated] = await db.query('SELECT cases FROM problem WHERE id = ?', [id]);
    expect(Number(updated.cases)).toBe(2);
    const userId = Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub);
    await app.get(RedisService).del(`submit-throttle:${userId}`);
    const response = await request(app.getHttpServer()).post('/submissions').set(auth())
      .send({ problemId: id, language: 9, code: 'a,b=map(int,input().split());print(a+b)' }).expect(201);
    const result = await until(async () => (await request(app.getHttpServer()).get(`/submissions/${response.body.id}`).expect(200)).body,
      body => body.status === Status.AC || body.status === Status.SE || body.status === Status.CE, 30000);
    expect(result.status).toBe(Status.AC);
    const [misc] = await db.query('SELECT judgeResult FROM submission_misc WHERE submissionId = ?', [response.body.id]);
    expect(JSON.parse(misc.judgeResult).testcases.map((item: { id: number; verdict: string }) => [item.id, item.verdict]))
      .toEqual([[1, 'AC'], [2, 'AC']]);
    const [row] = await db.query('SELECT submits, accepts FROM problem WHERE id = ?', [id]);
    expect(Number(row.accepts)).toBe(1);
    expect(Number(row.submits)).toBe(1);
    // A fast program may finish before the first Docker stats sample; never report a fake zero.
    expect(result.memory).not.toBe(0);
    if (result.memory != null) expect(result.memory).toBeGreaterThan(0);
  }, 45000);

  it('runs a two-Bot match and stores the winner/ELO only once', async () => {
    const judge = `import json,sys
for line in sys.stdin:
 d=json.loads(line); r=d.get('responses',{})
 if not r:
  out={'commands':{'0':{'target':5},'1':{'target':5}},'verdict':'continue'}
 else:
  out={'commands':{},'verdict':'finish','scores':{'0':int(r.get('0')==5),'1':int(r.get('1')==5)}}
 print(json.dumps(out),flush=True)
 if r: break`;
    const created = await request(app.getHttpServer()).post('/compete/games').set(auth())
      .send({ title:'Runtime match', description:'Fixture', gamerQuantity:2, timeLimit:1000, memoryLimit:256, disabled:false, judgerCode:judge, judgerLanguage:'python' }).expect(201);
    const gameId = created.body.id as number;
    const createBot = async (title:string, language:string, code:string) =>
      (await request(app.getHttpServer()).post('/compete/gamers').set(auth())
        .send({ gameId, title, type:'code', opensource:true, language, code }).expect(201)).body.id as number;
    const winner = await createBot('Winner', 'python', 'import sys,json\njson.loads(sys.stdin.readline());print(json.dumps({"move":5}),flush=True)');
    const loser = await createBot('Other', 'cpp17', '#include <iostream>\nint main(){std::string s;std::getline(std::cin,s);std::cout<<4<<std::endl;}');
    const match = await request(app.getHttpServer()).post('/compete/matches').set(auth())
      .send({ gameId, gamerIds:[winner, loser] }).expect(201);
    const settled = await until(async () => (await request(app.getHttpServer()).get(`/compete/matches/${match.body.id}`).expect(200)).body,
      row => row.status === 2 || row.status === 3, 45000);
    expect(settled.status).toBe(2);
    const result = JSON.parse(settled.result);
    expect(result.finalResult).toEqual({ [winner]:1, [loser]:0 });
    const rows = await app.get(DataSource).query('SELECT gamerId FROM gamer_elo_history WHERE matchId=?',[match.body.id]);
    expect(rows.map((row:{gamerId:number}) => row.gamerId).sort()).toEqual([winner, loser].sort());
    // SQL is committed before the Redis game-over notification. Wait for both
    // so shutdown cannot mask a failed cross-instance SSE replay publication.
    const over = await until(() => app.get(RedisService).get(`human-turn:v1:over:${match.body.id}`),
      value => value !== null, 10000);
    expect(JSON.parse(over ?? 'null')).toEqual({ [winner]: 1, [loser]: 0 });
  }, 60000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
});
