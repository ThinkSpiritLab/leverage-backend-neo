/**
 * test-app.ts
 *
 * Creates a NestJS test application backed by the real containers started in globalSetup.
 * Env vars (DB_HOST, DB_PORT, etc.) are already set by globalSetup before this runs.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  // Env vars are inherited from globalSetup (set before any test files are loaded).
  // AppModule → ConfigModule.forRoot already validated them at import time.
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Disable throttling in E2E tests to avoid rate-limit interference
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  // synchronize covers entities; the ELO history table is owned by a raw-SQL migration.
  await app.get(DataSource).query(`CREATE TABLE IF NOT EXISTS gamer_elo_history (
    id int NOT NULL AUTO_INCREMENT PRIMARY KEY, gamerId int NOT NULL, matchId int NOT NULL,
    eloBefore int NOT NULL, eloAfter int NOT NULL, eloDelta int NOT NULL,
    createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
  ) ENGINE=InnoDB`);
  return app;
}
