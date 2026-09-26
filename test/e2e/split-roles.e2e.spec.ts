import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { InternalJudgeWorker } from '../../src/modules/judge-runtime/internal-judge.worker';
import { RedisService } from '../../src/modules/redis/redis.service';
import { Status } from '../../src/modules/judge-runtime/judge-status';
import { zipCases } from './zip-cases';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(get: () => Promise<T>, accept: (value: T) => boolean, ms = 30000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await get();
    if (accept(value)) return value;
    await pause(150);
  }
  throw new Error('split-role job did not finish within the test budget');
}
function waitForWorker(worker: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let recent = '';
    let ready = false;
    const timer = setTimeout(() => reject(new Error('worker startup timed out')), 30000);
    worker.stdout?.on('data', (chunk: Buffer) => {
      recent = (recent + chunk.toString()).slice(-4096);
      if (!ready && recent.includes('Worker application context started')) {
        ready = true;
        clearTimeout(timer);
        resolve();
      }
    });
    worker.stderr?.on('data', () => {}); // drain logs; never expose env/secrets in test output
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => {
      if (!ready) { clearTimeout(timer); reject(new Error(`worker exited before ready (${code})`)); }
    });
  });
}
describe('separate API and worker processes', () => {
  let app: Awaited<ReturnType<typeof import('./test-app')['createTestApp']>>;
  let worker: ChildProcess | undefined;
  let root: string;
  let token: string;
  let priorRole: string | undefined;
  let priorData: string | undefined;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'leverage-split-'));
    priorRole = process.env.BACKEND_ROLE;
    priorData = process.env.TEST_CASES_PATH;
    process.env.BACKEND_ROLE = 'api';
    process.env.TEST_CASES_PATH = root;
    // AppModule decorators read BACKEND_ROLE at import time; defer this require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createTestApp } = require('./test-app') as typeof import('./test-app');
    app = await createTestApp();
    expect(() => app.get(InternalJudgeWorker)).toThrow();
    const [admin] = await app.get(DataSource).query("SELECT id, username FROM user WHERE authority = 'sa' LIMIT 1");
    token = app.get(JwtService).sign({ sub: admin.id, username: admin.username, role: 'sa' },
      { secret: process.env.JWT_ACCESS_SECRET });
    worker = spawn(process.execPath, ['dist/src/main.js'], {
      cwd: process.cwd(), env: { ...process.env, BACKEND_ROLE: 'worker' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForWorker(worker);
  }, 60000);

  afterAll(async () => {
    let timedOut = false;
    try {
      if (worker?.pid && worker.exitCode === null) {
        const exited = new Promise<void>(resolve => worker!.once('exit', () => resolve()));
        const watchdog = setTimeout(() => { timedOut = true; worker?.kill('SIGKILL'); }, 10000);
        worker.kill('SIGTERM');
        await exited;
        clearTimeout(watchdog);
      }
    } finally {
      try { await app?.close(); }
      finally {
        if (priorRole === undefined) delete process.env.BACKEND_ROLE;
        else process.env.BACKEND_ROLE = priorRole;
        if (priorData === undefined) delete process.env.TEST_CASES_PATH;
        else process.env.TEST_CASES_PATH = priorData;
        if (root) await fs.rm(root, { recursive: true, force: true });
      }
    }
    expect(timedOut).toBe(false);
  }, 20000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  it('judges a submission in the worker process and exposes its result through API-only', async () => {
    const created = await request(app.getHttpServer()).post('/problems').set(auth())
      .send({ title: 'Split sum', content: 'a+b', timeLimit: 1000, memoryLimit: 64 }).expect(201);
    const id = created.body.id as number;
    const db = app.get(DataSource);
    await request(app.getHttpServer()).post(`/problems/${id}/test-data`).set(auth())
      .attach('file', await zipCases({ '1.in': '2 3\n', '1.out': '5\n' }),
        { filename: 'cases.zip', contentType: 'application/zip' }).expect(201);
    const listing = await request(app.getHttpServer()).get(`/problems/${id}/test-cases`).set(auth()).expect(200);
    expect(listing.body.sort()).toEqual(['1.in', '1.out']);
    await app.get(RedisService).del(`submit-throttle:${Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub)}`);
    const submission = await request(app.getHttpServer()).post('/submissions').set(auth())
      .send({ problemId: id, language: 9, code: 'a,b=map(int,input().split());print(a+b)' }).expect(201);
    const result = await until(async () => (await request(app.getHttpServer()).get(`/submissions/${submission.body.id}`).expect(200)).body,
      row => [Status.AC, Status.CE, Status.SE].includes(row.status), 45000);
    expect(result.status).toBe(Status.AC);
    const [count] = await db.query('SELECT submits, accepts FROM problem WHERE id = ?', [id]);
    expect([Number(count.submits), Number(count.accepts)]).toEqual([1, 1]);
  }, 50000);

  it('settles a match and sends game-over from the worker to API Redis', async () => {
    const judge = `import json,sys
for line in sys.stdin:
 d=json.loads(line); r=d.get('responses',{})
 if not r: out={'commands':{'0':'go','1':'go'},'verdict':'continue'}
 else: out={'commands':{},'verdict':'finish','scores':{'0':int(r.get('0')==1),'1':int(r.get('1')==1)}}
 print(json.dumps(out),flush=True)
 if r: break`;
    const game = await request(app.getHttpServer()).post('/compete/games').set(auth())
      .send({ title: 'Split match', description: 'Fixture', gamerQuantity: 2,
        timeLimit: 1000, memoryLimit: 256, disabled: false,
        judgerCode: judge, judgerLanguage: 'python' }).expect(201);
    const createBot = async (title: string, move: number) =>
      (await request(app.getHttpServer()).post('/compete/gamers').set(auth())
        .send({ gameId: game.body.id, title, type: 'code', opensource: true,
          language: 'python', code: `import sys;sys.stdin.readline();print(${move})` }).expect(201)).body.id as number;
    const winner = await createBot('first', 1);
    const loser = await createBot('second', 0);
    const match = await request(app.getHttpServer()).post('/compete/matches').set(auth())
      .send({ gameId: game.body.id, gamerIds: [winner, loser] }).expect(201);
    const settled = await until(async () => (await request(app.getHttpServer())
      .get(`/compete/matches/${match.body.id}`).expect(200)).body,
      row => row.status === 2 || row.status === 3, 45000);
    expect(settled.status).toBe(2);
    expect(JSON.parse(settled.result).finalResult).toEqual({ [winner]: 1, [loser]: 0 });
    const replay = await until(() => app.get(RedisService).get(`human-turn:v1:over:${match.body.id}`),
      value => value !== null, 10000);
    expect(JSON.parse(replay ?? 'null')).toEqual({ [winner]: 1, [loser]: 0 });
    const rows = await app.get(DataSource).query('SELECT gamerId FROM gamer_elo_history WHERE matchId=?', [match.body.id]);
    expect(rows.map((row: { gamerId: number }) => row.gamerId).sort()).toEqual([winner, loser].sort());
  }, 60000);
});
