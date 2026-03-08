/**
 * test-app.ts
 *
 * Creates a NestJS test application backed by the real containers started in globalSetup.
 * Env vars (DB_HOST, DB_PORT, etc.) are already set by globalSetup before this runs.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../src/app.module'

export async function createTestApp(): Promise<INestApplication> {
  // Env vars are inherited from globalSetup (set before any test files are loaded).
  // AppModule → ConfigModule.forRoot already validated them at import time.
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = module.createNestApplication()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.init()
  return app
}
