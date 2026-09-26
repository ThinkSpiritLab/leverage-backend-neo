import { CompeteCleanupTask } from './compete-cleanup.task';

describe('CompeteCleanupTask', () => {
  const gamerRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
  const matchRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
  const lease = {
    acquire: jest.fn().mockResolvedValue('owner'),
    renew: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(true),
  };
  const task = new CompeteCleanupTask(
    gamerRepo as never,
    matchRepo as never,
    lease as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only one owner performs maintenance and releases afterward', async () => {
    await task.cleanupTestData();
    expect(matchRepo.delete).toHaveBeenCalledTimes(1);
    expect(gamerRepo.delete).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledWith(
      'compete:cleanup:test-data',
      'owner',
    );
    lease.acquire.mockResolvedValueOnce(null);
    await task.cleanupTestData();
    expect(matchRepo.delete).toHaveBeenCalledTimes(1);
  });

  it('stops before the second delete on lease loss', async () => {
    lease.renew.mockResolvedValueOnce(false);
    await task.cleanupTestData();
    expect(matchRepo.delete).toHaveBeenCalledTimes(1);
    expect(gamerRepo.delete).not.toHaveBeenCalled();
  });

  it('does not run on worker-only instances', async () => {
    const previous = process.env.BACKEND_ROLE;
    process.env.BACKEND_ROLE = 'worker';
    try {
      await task.cleanupTestData();
      expect(lease.acquire).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.BACKEND_ROLE;
      else process.env.BACKEND_ROLE = previous;
    }
  });
});
