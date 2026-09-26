import { SubmissionService } from './submission.service';
import { Submission } from '../../database/entities/submission.entity';
import { Status } from '../heng/heng.types';

function fixture() {
  const submission: any = {
    id: 7,
    userId: 2,
    provider: 'botzone',
    judgeAttempt: 'old',
    externalJobId: 'old-job',
    status: Status.AC,
    language: 0,
    problem: { id: 3, timeLimit: 1000, memoryLimit: 65536 },
    problemId: 3,
  };
  const misc = {
    code: 'int main(){}',
    judgeResult: 'old-result',
    compileErrorMsg: '',
  };
  const manager: any = {
    findOne: jest.fn(async (entity: unknown) =>
      entity === Submission ? submission : misc,
    ),
    save: jest.fn(async (_entity: unknown, value: unknown) => value),
    update: jest.fn(async (_entity: unknown, _where: unknown, values: any) => {
      Object.assign(submission, values);
      return { affected: 1 };
    }),
  };
  const repo: any = {
    findOne: jest.fn(async () => submission),
    update: jest.fn(async () => ({ affected: 1 })),
    manager: { transaction: (fn: any) => fn(manager) },
  };
  const queue: any = { add: jest.fn() };
  const botzone: any = {
    enqueue: jest.fn(async () => ({ externalJobId: 'new-job' })),
  };
  const service = new SubmissionService(
    repo,
    { findOne: async () => misc, update: jest.fn() } as any,
    {} as any,
    { save: jest.fn() } as any,
    {} as any,
    {} as any,
    { get: (_key: string, defaultValue: any) => defaultValue } as any,
    queue,
    {} as any,
    botzone,
    { finalize: jest.fn() } as any,
  );
  jest.spyOn(service as any, 'readTestcases').mockResolvedValue([]);
  jest.spyOn(service as any, 'loadCheckerInfo').mockResolvedValue({});
  return { service, botzone, queue, manager, repo, submission };
}

describe('provider-aware rejudge', () => {
  it('rejudges through the original provider with a fresh attempt and no previous job', async () => {
    const f = fixture();
    await f.service.rejudge(7);
    expect(f.botzone.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: 7,
        attemptId: expect.stringMatching(/^[a-f0-9]{32}$/),
      }),
    );
    expect(f.queue.add).not.toHaveBeenCalled();
    expect(f.manager.update).toHaveBeenCalledWith(
      Submission,
      7,
      expect.objectContaining({
        externalJobId: null,
        judgeAttempt: expect.any(String),
      }),
    );
  });
});
