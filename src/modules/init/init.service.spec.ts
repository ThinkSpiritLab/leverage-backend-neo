import { ConfigService } from '@nestjs/config';
import { InitService } from './init.service';

describe('bootstrap SA admission', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalPassword = process.env.INIT_SA_PASSWORD;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalPassword === undefined) delete process.env.INIT_SA_PASSWORD;
    else process.env.INIT_SA_PASSWORD = originalPassword;
  });

  it('rejects missing bootstrap credentials before creating a non-test SA', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INIT_SA_PASSWORD;
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
    };
    const settings = { count: jest.fn() };
    const config = { get: (key: string) => key === 'skipInit' ? false : undefined };
    const service = new InitService(repo as never, settings as never, config as ConfigService);
    await expect(service.onModuleInit()).rejects.toThrow(/INIT_SA_PASSWORD/);
    expect(repo.create).not.toHaveBeenCalled();
    expect(settings.count).not.toHaveBeenCalled();
  });
});
