/**
 * Jest globalSetup — starts MariaDB + Redis containers before any test files are loaded.
 *
 * WHY globalSetup? @nestjs/config's ConfigModule.forRoot is an async static method
 * that runs Joi validation at MODULE IMPORT TIME (not at compile time). This means
 * env vars must be set before Jest loads test files. globalSetup runs in the main
 * Jest process before workers fork, so env vars set here are inherited by workers.
 */
import { MariaDbContainer } from '@testcontainers/mariadb';
import { GenericContainer } from 'testcontainers';
import * as fs from 'fs';
import * as path from 'path';

export const CONTAINER_INFO_FILE = path.join(__dirname, '.container-info.json');

export default async function globalSetup() {
  console.log('\n🐳 Starting testcontainers (MariaDB 10.11 + Redis 7)...');

  const [mariadb, redis] = await Promise.all([
    new MariaDbContainer('mariadb:10.11')
      .withDatabase('leverage_test')
      .withUsername('test')
      .withUserPassword('testpass')
      .start(),
    new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
  ]);

  console.log(
    `✅ MariaDB: ${mariadb.getHost()}:${mariadb.getMappedPort(3306)}`,
  );
  console.log(`✅ Redis:   ${redis.getHost()}:${redis.getMappedPort(6379)}`);

  // Store container IDs for teardown (container objects can't cross process boundaries)
  const info = {
    mariadbId: mariadb.getId(),
    redisId: redis.getId(),
    dbHost: mariadb.getHost(),
    dbPort: mariadb.getMappedPort(3306),
    redisHost: redis.getHost(),
    redisPort: redis.getMappedPort(6379),
  };
  fs.writeFileSync(CONTAINER_INFO_FILE, JSON.stringify(info, null, 2));

  // Set env vars — inherited by Jest worker processes (or same process with runInBand)
  // These MUST be set before test files are imported (ConfigModule.forRoot validates at import time)
  process.env.DB_HOST = info.dbHost;
  process.env.DB_PORT = String(info.dbPort);
  process.env.DB_DATABASE = 'leverage_test';
  process.env.DB_USERNAME = 'test';
  process.env.DB_PASSWORD = 'testpass';
  process.env.REDIS_HOST = info.redisHost;
  process.env.REDIS_PORT = String(info.redisPort);
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
  process.env.SKIP_INIT = 'false';
  // Heng: 使用 mock URL，由 nock 拦截，不发送到真实 heng
  process.env.HENG_BASE_URL = 'http://mock-heng.test';
  process.env.HENG_AK = 'test-ak';
  process.env.HENG_SK = 'test-sk';
  // 限速设置：设为 1，测试速率限制（count > max 才触发，所以第2次提交才429）
  process.env.MAX_SUBMISSION_PER_MINUTE = '1';
}
