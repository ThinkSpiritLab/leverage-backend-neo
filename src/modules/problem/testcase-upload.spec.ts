import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProblemService } from './problem.service';
import type { Problem } from '../../database/entities/problem.entity';
import { zipCases } from '../../../test/e2e/zip-cases';

it('restores the previous files if the database update fails after replacement', async () => {
  const before = process.env.TEST_CASES_PATH;
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'leverage-upload-rollback-'),
  );
  process.env.TEST_CASES_PATH = root;
  const target = path.join(root, 'p', '1001');
  try {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, '1.in'), 'old input');
    await fs.writeFile(path.join(target, '1.out'), 'old output');
    const problem = { id: 1, prefix: 'p', logicId: 1001 } as Problem;
    const repo = { findOne: jest.fn().mockResolvedValue(problem) };
    const manager = {
      findOne: jest.fn().mockResolvedValue(problem),
      update: jest.fn().mockRejectedValue(new Error('fixture DB failure')),
    };
    const dataSource = {
      transaction: async (fn: (value: typeof manager) => Promise<void>) =>
        fn(manager),
    };
    const cache = { del: jest.fn() };
    const service = new ProblemService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cache as never,
      dataSource as never,
    );
    const file = {
      originalname: 'cases.zip',
      mimetype: 'application/zip',
      buffer: await zipCases({ '1.in': 'new input', '1.out': 'new output' }),
    } as Express.Multer.File;
    await expect(service.uploadTestData(1, file)).rejects.toThrow(
      'fixture DB failure',
    );
    expect(await fs.readFile(path.join(target, '1.in'), 'utf8')).toBe(
      'old input',
    );
    expect(await fs.readFile(path.join(target, '1.out'), 'utf8')).toBe(
      'old output',
    );
    expect(await fs.readdir(path.join(root, 'p'))).toEqual(['1001']);
    expect(cache.del).not.toHaveBeenCalled();
  } finally {
    if (before === undefined) delete process.env.TEST_CASES_PATH;
    else process.env.TEST_CASES_PATH = before;
    await fs.rm(root, { recursive: true, force: true });
  }
});
