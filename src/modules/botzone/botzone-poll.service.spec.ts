import { Status } from '../heng/heng.types';
import { BotzonePollService } from './botzone-poll.service';

describe('BotzonePollService current attempt', () => {
  it('selects and forwards judgeAttempt so completed Bull jobs can settle', async () => {
    const attempt = 'a'.repeat(32);
    let selected: string[] = [];
    const query: any = {
      where: jest.fn(), andWhere: jest.fn(), select: jest.fn((fields: string[]) => {
        selected = fields;
        return query;
      }), limit: jest.fn(),
      getMany: jest.fn(async () => [{
        id: 42, externalJobId: 'job-42', status: Status.PENDING,
        judgeAttempt: selected.includes('s.judgeAttempt') ? attempt : undefined,
      }]),
    };
    for (const key of ['where', 'andWhere', 'limit']) query[key].mockReturnValue(query);
    const poll = jest.fn(async () => ({ done: true, status: Status.AC }));
    const finalize = jest.fn(async () => undefined);
    const service = new BotzonePollService(
      { get: jest.fn((_key: string, fallback: unknown) => fallback) } as any,
      { createQueryBuilder: jest.fn(() => query) } as any,
      { poll } as any,
      { finalize } as any,
    );
    await service.doPoll();
    expect(poll).toHaveBeenCalledWith(42, 'job-42');
    expect(finalize).toHaveBeenCalledWith(42, { done: true, status: Status.AC }, 'job-42', attempt);
  });
});
