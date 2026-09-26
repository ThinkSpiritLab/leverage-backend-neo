import { ConfigService } from '@nestjs/config';
import { createDatabaseOptions } from './database.module';

describe('database startup options', () => {
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          'database.host': 'localhost',
          'database.port': 3306,
          'database.database': 'test',
          'database.username': 'test',
          'database.password': 'test',
        })[key],
    ),
  } as unknown as ConfigService;
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('does not log SQL parameters from source code or webhook secrets by default', () => {
    process.env.NODE_ENV = 'development';
    expect(createDatabaseOptions(config, 'all').logging).not.toContain('query');
  });
  it('passes only supported mysql2 pool options', () => {
    const extra = createDatabaseOptions(config, 'all').extra;
    expect(extra).not.toHaveProperty('acquireTimeout');
    expect(extra).not.toHaveProperty('idleTimeoutMillis');
    expect(extra).toHaveProperty('idleTimeout', 600000);
  });

  it('never synchronizes or runs migrations on workers even in development', () => {
    process.env.NODE_ENV = 'development';
    const opts = createDatabaseOptions(config, 'worker');
    expect(opts.synchronize).toBe(false);
    expect(opts.migrationsRun).toBe(false);
    expect(opts.migrations).toEqual([]);
  });

  it('preserves single-instance development synchronization on all/api', () => {
    process.env.NODE_ENV = 'development';
    for (const role of ['all', 'api'] as const) {
      const opts = createDatabaseOptions(config, role);
      expect(opts.synchronize).toBe(true);
      expect(opts.migrationsRun).toBe(false);
    }
  });

  it('uses the emitted migration directory on all/api production', () => {
    process.env.NODE_ENV = 'production';
    for (const role of ['all', 'api'] as const) {
      const opts = createDatabaseOptions(config, role);
      expect(opts.synchronize).toBe(false);
      expect(opts.migrationsRun).toBe(true);
      expect(opts.migrations).toEqual([
        expect.stringMatching(/migrations\/\*\.js$/),
      ]);
      expect(opts.migrations).toEqual([
        expect.stringContaining('/src/migrations/'),
      ]);
    }
  });
});
