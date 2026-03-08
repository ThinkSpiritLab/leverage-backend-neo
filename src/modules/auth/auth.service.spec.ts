import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestUser } from '../../database/entities/contest-user.entity';
import { Contest } from '../../database/entities/contest.entity';
import { User } from '../../database/entities/user.entity';
import { hashPassword } from '../../common/utils/crypto.util';
import { AuthService } from './auth.service';

const mockUserRepository = () => ({
  findOne: jest.fn(),
  update: jest.fn(),
});

const mockContestUserRepository = () => ({
  findOne: jest.fn(),
});

const mockContestRepository = () => ({
  findOne: jest.fn(),
});

const mockJwtService = () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
});

const mockConfigService = () => ({
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      'jwt.accessSecret': 'test-access-secret',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.accessExpiresIn': '15m',
      'jwt.refreshExpiresIn': '7d',
    };
    return config[key] ?? defaultValue;
  }),
});

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<Repository<User>>;
  let contestUserRepo: jest.Mocked<Repository<ContestUser>>;
  let contestRepo: jest.Mocked<Repository<Contest>>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        {
          provide: getRepositoryToken(ContestUser),
          useFactory: mockContestUserRepository,
        },
        {
          provide: getRepositoryToken(Contest),
          useFactory: mockContestRepository,
        },
        { provide: JwtService, useFactory: mockJwtService },
        { provide: ConfigService, useFactory: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get(getRepositoryToken(User));
    contestUserRepo = module.get(getRepositoryToken(ContestUser));
    contestRepo = module.get(getRepositoryToken(Contest));
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loginUser', () => {
    it('正确密码 → 返回 accessToken + refreshToken', async () => {
      const password = 'correctPassword';
      const user = {
        id: 1,
        username: 'alice',
        authority: 'user',
        passwordHash: hashPassword(password),
        status: 0,
      } as User;

      userRepo.findOne.mockResolvedValue(user);
      userRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.loginUser('alice', password);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('错误密码 → 抛出 UnauthorizedException', async () => {
      const user = {
        id: 1,
        username: 'alice',
        authority: 'user',
        passwordHash: hashPassword('correctPassword'),
        status: 0,
      } as User;

      userRepo.findOne.mockResolvedValue(user);

      await expect(service.loginUser('alice', 'wrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('用户不存在 → 抛出 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.loginUser('nobody', 'anyPassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('旧格式密码验证通过后触发 upgradePasswordIfNeeded', async () => {
      // 旧格式：不含 pbkdf2: 前缀
      // 由于旧格式 legacyVerify 需要 HMAC key，这里测试升级路径本身
      // 我们直接 mock：旧格式 hash 验证总是 false（没有 HMAC key），
      // 所以旧格式密码在没有配置 PASSWORD_HMAC_KEY 时会验证失败
      // 这里测试当新格式密码登录时，isLegacyPasswordFormat 为 false，不触发升级
      const password = 'newFormatPassword';
      const user = {
        id: 1,
        username: 'bob',
        authority: 'user',
        passwordHash: hashPassword(password), // 新格式
        status: 0,
      } as User;

      userRepo.findOne.mockResolvedValue(user);
      userRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.loginUser('bob', password);

      // 新格式不应触发 update（upgradePasswordIfNeeded 不会被调用）
      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('loginContest', () => {
    const contestId = 1;
    const password = 'contestPassword';

    it('allowDirectLogin=true 用全站密码验证', async () => {
      const user = {
        id: 1,
        username: 'alice',
        passwordHash: hashPassword(password),
      } as User;

      const contestUser = {
        contestId: 1,
        userId: 1,
        passwordHash: null,
      } as ContestUser;

      const contest = {
        id: 1,
        allowDirectLogin: true,
        deviceBindType: 0,
      } as Contest;

      userRepo.findOne.mockResolvedValue(user);
      contestUserRepo.findOne.mockResolvedValue(contestUser);
      contestRepo.findOne.mockResolvedValue(contest);

      const result = await service.loginContest(contestId, 'alice', password);

      expect(result).toHaveProperty('accessToken');
    });

    it('allowDirectLogin=false 用竞赛独立密码验证', async () => {
      const contestPass = 'contestSpecificPassword';

      const user = {
        id: 2,
        username: 'bob',
        passwordHash: hashPassword('globalPassword'),
      } as User;

      const contestUser = {
        contestId: 1,
        userId: 2,
        passwordHash: hashPassword(contestPass), // 竞赛独立密码
      } as ContestUser;

      const contest = {
        id: 1,
        allowDirectLogin: false,
        deviceBindType: 0,
      } as Contest;

      userRepo.findOne.mockResolvedValue(user);
      contestUserRepo.findOne.mockResolvedValue(contestUser);
      contestRepo.findOne.mockResolvedValue(contest);

      const result = await service.loginContest(contestId, 'bob', contestPass);

      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('refreshToken', () => {
    it('有效 refresh token → 返回新 accessToken', async () => {
      const payload = { sub: 1, username: 'alice', role: 'user' };
      jwtService.verify.mockReturnValue(payload);
      jwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(jwtService.verify).toHaveBeenCalled();
    });

    it('无效 token → 抛出 UnauthorizedException', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── loginContest 分支补充 ──────────────────────────────────────────────────

  describe('loginContest - 未覆盖分支', () => {
    it('用户不存在 → 抛出 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.loginContest(1, 'nobody', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('用户不在竞赛中（contestUser 不存在）→ 抛出 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        passwordHash: hashPassword('pass'),
      } as User);
      contestUserRepo.findOne.mockResolvedValue(null);
      await expect(service.loginContest(1, 'alice', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('竞赛不存在 → 抛出 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        passwordHash: hashPassword('pass'),
      } as User);
      contestUserRepo.findOne.mockResolvedValue({
        contestId: 1,
        userId: 1,
        passwordHash: null,
      } as ContestUser);
      contestRepo.findOne.mockResolvedValue(null);
      await expect(service.loginContest(1, 'alice', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('allowDirectLogin=true 密码错误 → 抛出 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        passwordHash: hashPassword('correct'),
      } as User);
      contestUserRepo.findOne.mockResolvedValue({
        contestId: 1,
        userId: 1,
        passwordHash: null,
      } as ContestUser);
      contestRepo.findOne.mockResolvedValue({
        id: 1,
        allowDirectLogin: true,
      } as Contest);
      await expect(service.loginContest(1, 'alice', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('allowDirectLogin=false + contestUser.passwordHash=null → 直接通过（无需密码）', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        passwordHash: hashPassword('globalPass'),
      } as User);
      contestUserRepo.findOne.mockResolvedValue({
        contestId: 1,
        userId: 1,
        passwordHash: null,
      } as ContestUser);
      contestRepo.findOne.mockResolvedValue({
        id: 1,
        allowDirectLogin: false,
      } as Contest);
      const result = await service.loginContest(1, 'alice', 'anyPassword');
      expect(result).toHaveProperty('accessToken');
    });

    it('allowDirectLogin=false + 竞赛密码错误 → 抛出 UnauthorizedException', async () => {
      const contestPass = 'correctContestPass';
      userRepo.findOne.mockResolvedValue({
        id: 2,
        username: 'bob',
        passwordHash: hashPassword('globalPass'),
      } as User);
      contestUserRepo.findOne.mockResolvedValue({
        contestId: 1,
        userId: 2,
        passwordHash: hashPassword(contestPass),
      } as ContestUser);
      contestRepo.findOne.mockResolvedValue({
        id: 1,
        allowDirectLogin: false,
      } as Contest);
      await expect(
        service.loginContest(1, 'bob', 'wrongContestPass'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── mapAuthority 分支覆盖 ──────────────────────────────────────────────────

  describe('mapAuthority - 所有权限分支', () => {
    const makeUser = (authority: string) =>
      ({
        id: 1,
        username: 'test',
        authority,
        passwordHash: hashPassword('pass'),
        status: 0,
      }) as User;

    it('authority=superadmin → role=sa', async () => {
      userRepo.findOne.mockResolvedValue(makeUser('superadmin'));
      await service.loginUser('test', 'pass');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'sa' }),
        expect.any(Object),
      );
    });

    it('authority=sa → role=sa', async () => {
      userRepo.findOne.mockResolvedValue(makeUser('sa'));
      await service.loginUser('test', 'pass');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'sa' }),
        expect.any(Object),
      );
    });

    it('authority=admin → role=admin', async () => {
      userRepo.findOne.mockResolvedValue(makeUser('admin'));
      await service.loginUser('test', 'pass');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
        expect.any(Object),
      );
    });

    it('authority=supervisor → role=supervisor', async () => {
      userRepo.findOne.mockResolvedValue(makeUser('supervisor'));
      await service.loginUser('test', 'pass');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'supervisor' }),
        expect.any(Object),
      );
    });

    it('authority=unknown → role=user（default）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser('something_else'));
      await service.loginUser('test', 'pass');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' }),
        expect.any(Object),
      );
    });
  });

  // ─── upgradePasswordIfNeeded - 旧格式密码自动升级 ────────────────────────────

  describe('upgradePasswordIfNeeded - 旧格式密码', () => {
    it('旧格式密码登录时应触发 update（upgradePasswordIfNeeded）', async () => {
      // 构造一个符合旧格式的密码 hash（不含 pbkdf2: 前缀）并通过 legacy verify
      const hmacKey = 'test-hmac-key-for-test';
      const password = 'testPassword123';
      const { createHash, createHmac } = require('crypto');
      const legacyHash = createHmac('sha256', hmacKey)
        .update(createHash('md5').update(password).digest('hex'))
        .digest('hex');

      // Temporarily set the HMAC key env
      const origKey = process.env.PASSWORD_HMAC_KEY;
      process.env.PASSWORD_HMAC_KEY = hmacKey;

      try {
        userRepo.findOne.mockResolvedValue({
          id: 1,
          username: 'alice',
          authority: 'user',
          passwordHash: legacyHash, // 旧格式
          status: 0,
        } as User);
        userRepo.update.mockResolvedValue({ affected: 1 } as any);

        await service.loginUser('alice', password);

        // upgradePasswordIfNeeded should call userRepo.update
        expect(userRepo.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            passwordHash: expect.stringMatching(/^pbkdf2:/),
          }),
        );
      } finally {
        process.env.PASSWORD_HMAC_KEY = origKey;
      }
    });
  });
});
