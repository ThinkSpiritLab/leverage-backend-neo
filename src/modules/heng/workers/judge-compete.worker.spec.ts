import axios from 'axios';
import { JudgeTxWorker } from './judge-tx.worker';

function fixture() {
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const config = { get: (key: string, value?: unknown) => ({ 'botzone.baseUrl': 'http://fixture.invalid', 'botzone.callbackToken': 'fixture-token', baseUrl: 'http://backend.invalid' }[key] ?? value) };
  const worker = new JudgeTxWorker({} as any, {} as any, {} as any, config as any, {} as any, {} as any, { update } as any);
  const job: any = { data: { matchId: 1, game: { judgerLanguage: 'cpp17', judgerCode: 'fixture', timeLimit: 1000, memoryLimit: 256 }, gamers: [{ id: 1, type: 'code', language: 'python3', code: 'fixture' }] } };
  return { worker, job, update };
}

describe('compete runtime boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  it('normalizes established string aliases at the external boundary', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { jobId: 'fixture-job' } });
    const f = fixture();
    await f.worker.handleCompete(f.job);
    const body = post.mock.calls[0][1] as any;
    expect(body.game.judger.language).toBe('cpp');
    expect(body.game['0'].language).toBe('python');
  });
  it('terminates unsupported queued runtimes without retrying an invalid request', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { jobId: 'fixture-job' } });
    const f = fixture();
    f.job.data.gamers[0].language = 'java';
    await f.worker.handleCompete(f.job);
    expect(post).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenCalledWith(1, { status: 3 });
  });
});
