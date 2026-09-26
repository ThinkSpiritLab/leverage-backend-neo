jest.mock('./app.module', () => ({ AppModule: class TestAppModule {} }));

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { bootstrap } from './main';

describe('backend bootstrap', () => {
  const originalRole = process.env.BACKEND_ROLE;
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalRole === undefined) delete process.env.BACKEND_ROLE;
    else process.env.BACKEND_ROLE = originalRole;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('rejects an invalid role before creating an application', async () => {
    process.env.BACKEND_ROLE = 'invalid';
    const context = jest.spyOn(NestFactory, 'createApplicationContext');
    const http = jest.spyOn(NestFactory, 'create');
    await expect(bootstrap()).rejects.toThrow(/BACKEND_ROLE/);
    expect(context).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it('creates only an application context in worker mode', async () => {
    process.env.BACKEND_ROLE = 'worker';
    const worker = {
      useLogger: jest.fn(),
      get: jest.fn(() => ({ log: jest.fn() })),
      enableShutdownHooks: jest.fn(),
    };
    const context = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue(worker as never);
    const http = jest.spyOn(NestFactory, 'create');
    jest
      .spyOn(process, 'on')
      .mockImplementation((() => process) as typeof process.on);
    await bootstrap();
    expect(context).toHaveBeenCalledTimes(1);
    expect(worker.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(http).not.toHaveBeenCalled();
  });

  it.each(['all', 'api'] as const)('starts HTTP in %s mode', async (role) => {
    process.env.BACKEND_ROLE = role;
    process.env.NODE_ENV = 'production';
    const httpApp = {
      use: jest.fn(),
      useLogger: jest.fn(),
      get: jest.fn((token: unknown) =>
        token === ConfigService ? { get: () => 3111 } : { log: jest.fn() },
      ),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn(),
    };
    const http = jest
      .spyOn(NestFactory, 'create')
      .mockResolvedValue(httpApp as never);
    const context = jest.spyOn(NestFactory, 'createApplicationContext');
    jest
      .spyOn(process, 'on')
      .mockImplementation((() => process) as typeof process.on);
    await bootstrap();
    expect(http).toHaveBeenCalledTimes(1);
    expect(httpApp.listen).toHaveBeenCalledWith(3111);
    expect(context).not.toHaveBeenCalled();
  });
});
