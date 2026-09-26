import { ReceiveService } from './receive.service';
import { Submission } from '../../database/entities/submission.entity';
import { User } from '../../database/entities/user.entity';
import { Problem } from '../../database/entities/problem.entity';
import { JudgeResultKind, Status } from '../heng/heng.types';

const result = (kind = JudgeResultKind.Accepted) => ({
  cases: [{ kind, time: 1, memory: 1 }],
});

function fixture(overrides: Record<string, unknown> = {}) {
  const submission = {
    id: 1,
    userId: 2,
    problemId: 3,
    contestId: null,
    courseId: null,
    provider: null,
    judgeAttempt: 'current',
    judgedStatus: null,
    status: Status.PENDING,
    ...overrides,
  };
  const manager: any = {
    findOneOrFail: jest.fn(async (entity: unknown) =>
      entity === Submission ? submission : { id: 2 },
    ),
    findOne: jest.fn(async () => null),
    increment: jest.fn(async () => ({})),
    update: jest.fn(async (entity: unknown, _id: unknown, values: object) => {
      if (entity === Submission) Object.assign(submission, values);
      return { affected: 1 };
    }),
    save: jest.fn(async () => ({})),
  };
  const qb: any = { execute: jest.fn(async () => ({})) };
  for (const name of ['update', 'set', 'where']) qb[name] = jest.fn(() => qb);
  const source: any = {
    transaction: jest.fn(async (fn: any) => fn(manager)),
    createQueryBuilder: () => qb,
  };
  const redis: any = { set: jest.fn(), hget: jest.fn(), hset: jest.fn() };
  const rank: any = {
    updateContestRank: jest.fn(),
    updateCourseRank: jest.fn(),
  };
  const service = new ReceiveService(source, rank);
  const receive = (r = result(), attempt = 'current') =>
    (service.receiveResult as any)(1, r, attempt);
  return { submission, manager, source, redis, service, receive };
}

describe('result accounting regressions', () => {
  it('does not account a duplicate terminal delivery twice', async () => {
    const f = fixture();
    await f.receive();
    await f.receive();
    expect(
      f.manager.increment.mock.calls.filter(
        ([e, , field]: any[]) => e === Problem && field === 'submits',
      ),
    ).toHaveLength(1);
  });
  it('rejects an old attempt without changing the current submission', async () => {
    const f = fixture();
    await f.receive(result(), 'old');
    expect(f.manager.update).not.toHaveBeenCalled();
    expect(f.manager.increment).not.toHaveBeenCalled();
  });
  it('rejudging AC as WA removes its contribution without counting a new submission', async () => {
    const f = fixture({ judgedStatus: Status.AC });
    await f.receive(result(JudgeResultKind.WrongAnswer));
    expect(f.manager.increment).toHaveBeenCalledWith(
      Problem,
      { id: 3 },
      'accepts',
      -1,
    );
    expect(f.manager.increment).toHaveBeenCalledWith(
      User,
      { id: 2 },
      'accepts',
      -1,
    );
    expect(
      f.manager.increment.mock.calls.filter(
        ([, , field]: any[]) => field === 'submits',
      ),
    ).toHaveLength(0);
  });
  it('does not publish Redis effects before a failed SQL commit', async () => {
    const f = fixture();
    f.source.transaction.mockImplementation(async (fn: any) => {
      await fn(f.manager);
      throw new Error('commit failed');
    });
    await expect(f.receive()).rejects.toThrow('commit failed');
    expect(f.redis.set).not.toHaveBeenCalled();
    expect(f.redis.hset).not.toHaveBeenCalled();
  });
});
