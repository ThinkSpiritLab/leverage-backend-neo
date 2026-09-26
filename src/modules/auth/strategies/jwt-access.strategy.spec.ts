import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { JwtAccessStrategy } from './jwt-access.strategy';

describe('JwtAccessStrategy', () => {
  let strategy: JwtAccessStrategy;
  let userRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

  beforeEach(() => {
    userRepo = { findOne: jest.fn() };
    strategy = new JwtAccessStrategy(
      { get: () => 'test-secret' } as unknown as ConfigService,
      userRepo as unknown as Repository<User>,
    );
  });

  it('returns current database role rather than stale JWT role', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      username: 'alice',
      authority: 'user',
      status: 0,
    } as User);

    await expect(
      strategy.validate({ sub: 1, username: 'alice', role: 'sa' }),
    ).resolves.toEqual({ sub: 1, username: 'alice', role: 'user' });
  });

  it.each([
    ['deleted', null],
    [
      'banned indefinitely',
      { id: 1, username: 'alice', authority: 'user', status: 2 },
    ],
    [
      'temporarily banned',
      {
        id: 1,
        username: 'alice',
        authority: 'user',
        status: 2,
        statusEndsAt: new Date(Date.now() + 60_000),
      },
    ],
  ])('rejects %s accounts', async (_label, user) => {
    userRepo.findOne.mockResolvedValue(user as User | null);
    await expect(
      strategy.validate({ sub: 1, username: 'alice', role: 'user' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects contest token payloads on the ordinary JWT strategy', async () => {
    await expect(
      strategy.validate({
        sub: 1,
        username: 'alice',
        role: 'contest-user',
        contestId: 5,
      } as any),
    ).rejects.toThrow(UnauthorizedException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });
});
