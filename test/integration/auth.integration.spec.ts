/**
 * auth.integration.spec.ts
 *
 * Integration tests for AuthService using:
 * - SQLite in-memory (via better-sqlite3 + TypeORM)
 * - Real JWT signing (no external service)
 * - No real DB/Redis required
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { getToken } from '@willsoto/nestjs-prometheus';
import { AuthService } from '../../src/modules/auth/auth.service';
import { User } from '../../src/database/entities/user.entity';
import { Contest } from '../../src/database/entities/contest.entity';
import { ContestUser } from '../../src/database/entities/contest-user.entity';
import { Setting } from '../../src/database/entities/setting.entity';
import { hashPassword } from '../../src/common/utils/crypto.util';
import { ALL_ENTITIES, patchBoolColumnsForSqlite } from './setup';
import { LOGIN_TOTAL_COUNTER } from '../../src/modules/metrics/metrics.module';

// Patch 'bool' → 'integer' for SQLite compatibility (must run before module compilation)
patchBoolColumnsForSqlite();

// Integration tests may take longer due to DB setup
jest.setTimeout(30000);

// Test JWT secrets
const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

describe('AuthService (integration)', () => {
  let module: TestingModule;
  let authService: AuthService;
  let dataSource: DataSource;
  let userRepo: any;
  let contestRepo: any;
  let contestUserRepo: any;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              jwt: {
                accessSecret: ACCESS_SECRET,
                refreshSecret: REFRESH_SECRET,
                accessExpiresIn: '15m',
                refreshExpiresIn: '7d',
              },
            }),
          ],
          ignoreEnvFile: true,
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ALL_ENTITIES,
          synchronize: true,
          logging: false,
        } as any),
        TypeOrmModule.forFeature([User, ContestUser, Contest, Setting]),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>('jwt.accessSecret'),
            signOptions: { expiresIn: '15m' },
          }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        AuthService,
        {
          provide: getToken(LOGIN_TOTAL_COUNTER),
          useValue: { labels: jest.fn().mockReturnValue({ inc: jest.fn() }), inc: jest.fn() },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    dataSource = module.get<DataSource>(DataSource);
    userRepo = dataSource.getRepository(User);
    contestRepo = dataSource.getRepository(Contest);
    contestUserRepo = dataSource.getRepository(ContestUser);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    // Clean tables before each test (clear() is the safe way without needing criteria)
    await contestUserRepo.clear();
    await contestRepo.clear();
    await userRepo.clear();
  });

  describe('loginUser', () => {
    it('should return access and refresh tokens for valid credentials', async () => {
      // Arrange: create a user with hashed password
      const user = userRepo.create({
        username: 'testuser',
        passwordHash: hashPassword('password123'),
        authority: 'user',
        sex: 'unknown',
      });
      await userRepo.save(user);

      // Act
      const result = await authService.loginUser('testuser', 'password123');

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      // Arrange
      const user = userRepo.create({
        username: 'testuser2',
        passwordHash: hashPassword('correctpass'),
        authority: 'user',
        sex: 'unknown',
      });
      await userRepo.save(user);

      // Act & Assert
      await expect(
        authService.loginUser('testuser2', 'wrongpass'),
      ).rejects.toThrow('用户名或密码错误');
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      await expect(
        authService.loginUser('nonexistent', 'password'),
      ).rejects.toThrow('用户名或密码错误');
    });
  });

  describe('refreshToken', () => {
    it('should issue new access token from valid refresh token', async () => {
      // Arrange: login first to get a refresh token
      const user = userRepo.create({
        username: 'refreshuser',
        passwordHash: hashPassword('pass456'),
        authority: 'admin',
        sex: 'unknown',
      });
      await userRepo.save(user);

      const { refreshToken } = await authService.loginUser(
        'refreshuser',
        'pass456',
      );

      // Act: use refresh token to get new access token
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    });

    it('should throw UnauthorizedException for invalid refresh token', () => {
      expect(() => authService.refreshToken('invalid.jwt.token')).toThrow(
        'Refresh token 无效或已过期',
      );
    });

    it('should throw UnauthorizedException for access token used as refresh token', async () => {
      // Arrange: access token signed with access secret, not refresh secret
      const user = userRepo.create({
        username: 'tokenuser',
        passwordHash: hashPassword('pass'),
        authority: 'user',
        sex: 'unknown',
      });
      await userRepo.save(user);

      const { accessToken } = await authService.loginUser('tokenuser', 'pass');

      // Access token is signed with ACCESS_SECRET, refresh token verification uses REFRESH_SECRET
      // So using access token as refresh token should fail
      expect(() => authService.refreshToken(accessToken)).toThrow(
        'Refresh token 无效或已过期',
      );
    });
  });

  describe('loginContest', () => {
    it('should return contest access token when allowDirectLogin=true', async () => {
      // Arrange
      const user = userRepo.create({
        username: 'contestuser',
        passwordHash: hashPassword('mypassword'),
        authority: 'user',
        sex: 'unknown',
      });
      const savedUser = await userRepo.save(user);

      const contest = contestRepo.create({
        name: 'Test Contest',
        allowDirectLogin: true,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
      });
      const savedContest = await contestRepo.save(contest);

      const cu = contestUserRepo.create({
        contestId: savedContest.id,
        userId: savedUser.id,
        passwordHash: null,
      });
      await contestUserRepo.save(cu);

      // Act
      const result = await authService.loginContest(
        savedContest.id,
        'contestuser',
        'mypassword',
      );

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
    });

    it('should throw UnauthorizedException if user not enrolled in contest', async () => {
      const user = userRepo.create({
        username: 'notenrolled',
        passwordHash: hashPassword('pass'),
        authority: 'user',
        sex: 'unknown',
      });
      await userRepo.save(user);

      const contest = contestRepo.create({
        name: 'Another Contest',
        allowDirectLogin: true,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
      });
      const savedContest = await contestRepo.save(contest);

      await expect(
        authService.loginContest(savedContest.id, 'notenrolled', 'pass'),
      ).rejects.toThrow('用户未加入该竞赛');
    });
  });
});
