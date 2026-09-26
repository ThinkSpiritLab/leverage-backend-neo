import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { JwtContestStrategy } from './jwt-contest.strategy';

describe('JwtContestStrategy', () => {
  let strategy: JwtContestStrategy;
  let userRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

  beforeEach(() => {
    userRepo = { findOne: jest.fn() };
    strategy = new JwtContestStrategy(
      { get: () => 'test-secret' } as unknown as ConfigService,
      userRepo as unknown as Repository<User>,
    );
  });

  it('keeps a valid contest identity in the contest-user scope', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, status: 0 } as User);

    await expect(
      strategy.validate({ sub: 1, contestId: 5, role: 'contest-user' }),
    ).resolves.toEqual({ sub: 1, contestId: 5, role: 'contest-user' });
  });

  it('rejects ordinary JWT payloads on the contest strategy', async () => {
    await expect(
      strategy.validate({ sub: 1, contestId: 5, role: 'user' } as any),
    ).rejects.toThrow(UnauthorizedException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a contest token when its user is banned', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      status: 2,
      statusEndsAt: null,
    } as unknown as User);

    await expect(
      strategy.validate({ sub: 1, contestId: 5, role: 'contest-user' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
