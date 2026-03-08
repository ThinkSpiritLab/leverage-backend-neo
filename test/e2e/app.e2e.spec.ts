/**
 * app.e2e.spec.ts
 *
 * E2E tests for the NestJS application via supertest.
 *
 * NOTE: Full AppModule override (DatabaseModule + RedisModule + BullMQ) is complex
 * due to many interconnected providers. The tests below use a scoped NestJS
 * test module that only imports the necessary feature modules with SQLite + ioredis-mock.
 *
 * Tests that require a fully assembled AppModule are marked with it.skip() and
 * explained inline.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AuthModule } from '../../src/modules/auth/auth.module';
import { User } from '../../src/database/entities/user.entity';
import { Contest } from '../../src/database/entities/contest.entity';
import { ContestUser } from '../../src/database/entities/contest-user.entity';
import { RedisService } from '../../src/modules/redis/redis.service';
import { CacheService } from '../../src/modules/redis/cache.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES, patchBoolColumnsForSqlite } from '../integration/setup';
import { createMockRedisService } from '../integration/redis.mock';

// Patch 'bool' → 'integer' for SQLite compatibility
patchBoolColumnsForSqlite();

// E2E tests may take longer due to full NestJS app startup
jest.setTimeout(60000);
import { hashPassword } from '../../src/common/utils/crypto.util';

const ACCESS_SECRET = 'e2e-access-secret';
const REFRESH_SECRET = 'e2e-refresh-secret';

describe('App (e2e) — Auth endpoints', () => {
  let app: INestApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
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
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ALL_ENTITIES,
          synchronize: true,
          logging: false,
        } as any),
        AuthModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue(createMockRedisService())
      .overrideProvider(CacheService)
      .useFactory({
        factory: (redis: RedisService) => new CacheService(redis),
        inject: [RedisService],
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      // Seed a test user directly into the DB
      const dataSource = module.get<DataSource>(getDataSourceToken());
      const userRepo = dataSource.getRepository(User);
      await userRepo.clear();

      await userRepo.save(
        userRepo.create({
          username: 'testsa',
          passwordHash: hashPassword('AdminPass123'),
          authority: 'superadmin',
          sex: 'unknown',
        }),
      );
    });

    it('should return 200 with tokens for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'testsa', password: 'AdminPass123' })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should return 401 for invalid password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'testsa', password: 'wrongpassword' })
        .expect(401);
    });

    it('should return 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'pass' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    let validRefreshToken: string;

    beforeAll(async () => {
      // Login to get a refresh token
      const dataSource = module.get<DataSource>(getDataSourceToken());
      const userRepo = dataSource.getRepository(User);
      await userRepo.clear();

      await userRepo.save(
        userRepo.create({
          username: 'refreshtest',
          passwordHash: hashPassword('RefreshPass123'),
          authority: 'user',
          sex: 'unknown',
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'refreshtest', password: 'RefreshPass123' });

      validRefreshToken = res.body.refreshToken;
    });

    it('should issue a new access token with a valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
    });

    it('should return 401 for an invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'not.a.valid.token' })
        .expect(401);
    });
  });

  // ─── Skipped E2E Tests ──────────────────────────────────────────────────────
  //
  // The following tests require a full AppModule which includes:
  // - DatabaseModule (MariaDB → would need full DB override)
  // - RedisModule (Redis → would need full override)
  // - BullMQ queue module (requires Redis connection)
  // - InitModule (runs DB seeds on startup)
  //
  // Overriding all these in a single TestingModule is complex and
  // error-prone. They are left as it.skip() for future implementation
  // once a dedicated test AppModule factory is created.

  it.skip('GET /problems — should require auth (401)', async () => {
    // TODO: requires full AppModule with ProblemModule registered
    await request(app.getHttpServer()).get('/problems').expect(401);
  });

  it.skip('GET /problems — with valid token should return 200', async () => {
    // TODO: requires full AppModule; login first then use token in header
  });

  it.skip('GET /users — admin only endpoint', async () => {
    // TODO: requires full AppModule with UserModule registered
  });
});
