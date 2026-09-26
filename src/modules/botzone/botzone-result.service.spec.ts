
import { Status } from '../heng/heng.types';
import { ReceiveService } from '../receive/receive.service';
import { BotzoneResultService } from './botzone-result.service';

describe('Botzone result identity at shared settlement boundary', () => {
  const attempt = 'a'.repeat(32);
  const submission = {
    id: 42, provider: 'botzone', judgeAttempt: attempt,
    externalJobId: 'job-42', status: Status.PENDING,
  };
  const setup = () => {
    const manager = {
      findOneOrFail: jest.fn(() => Promise.resolve(submission)),
      update: jest.fn(),
      increment: jest.fn(),
    };
    const source = { transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager)) };
    const service = new BotzoneResultService(new ReceiveService(source as any, {} as any));
    return { manager, service };
  };
  const result = { done: true, status: Status.AC };

  it('ignores a correctly signed but stale raw callback attempt', async () => {
    const { manager, service } = setup();
    await service.finalize(42, result, undefined, 'b'.repeat(32));
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.increment).not.toHaveBeenCalled();
  });

  it('ignores a legacy envelope with the wrong saved job ID', async () => {
    const { manager, service } = setup();
    await service.finalize(42, result, 'other-job', attempt);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.increment).not.toHaveBeenCalled();
  });

  it('ignores a legacy envelope without attempt when job ID is absent', async () => {
    const { manager, service } = setup();
    await service.finalize(42, result);
    expect(manager.update).not.toHaveBeenCalled();
  });
});
