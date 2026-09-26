import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ModuleRef } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompeteController } from './compete.controller';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('optional Bot detail authentication', () => {
  const context = (headers: Record<string, string | undefined>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as ExecutionContext;
  const guard = new OptionalJwtAuthGuard({} as ModuleRef);

  afterEach(() => jest.restoreAllMocks());

  it('keeps anonymous detail accessible', async () => {
    const auth = jest.spyOn(JwtAuthGuard.prototype, 'canActivate');
    await expect(guard.canActivate(context({}))).resolves.toBe(true);
    expect(auth).not.toHaveBeenCalled();
  });

  it.each([{ authorization: 'Bearer valid' }, { 'x-api-key': 'valid' }])(
    'uses the existing auth path for supplied credentials: %j',
    async (headers) => {
      const auth = jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockResolvedValue(true);
      await expect(guard.canActivate(context(headers))).resolves.toBe(true);
      expect(auth).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { authorization: 'Bearer invalid' },
    { authorization: 'Basic invalid' },
    { 'x-api-key': 'invalid' },
  ])('rejects invalid presented credentials: %j', async (headers) => {
    const auth = jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(context(headers))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it('routes authenticated owner identity into the detail service', async () => {
    const handler = Object.getOwnPropertyDescriptor(
      CompeteController.prototype,
      'findOneGamer',
    )?.value;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      OptionalJwtAuthGuard,
    );
    const service = { findOneGamer: jest.fn().mockResolvedValue({ id: 10 }) };
    const controller = new CompeteController(
      service as any,
      { get: () => '' } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await controller.findOneGamer(10, {
      sub: 42,
      username: 'owner',
      role: 'admin',
    });
    expect(service.findOneGamer).toHaveBeenCalledWith(10, 42);
  });
});
