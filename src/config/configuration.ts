export default () => ({
  backendRole: process.env.BACKEND_ROLE ?? 'all',
  judge: {
    image: process.env.JUDGE_IMAGE || 'leverage-judge-runtime:local',
    testCasesPath: process.env.TEST_CASES_PATH || '/tmp/testcases',
    maxMatchMs: parseInt(process.env.JUDGE_MAX_MATCH_MS || '300000', 10),
    maxRounds: parseInt(process.env.JUDGE_MAX_ROUNDS || '1000', 10),
  },
  port: parseInt(process.env.PORT ?? '3000', 10) || 3000,
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  skipInit: process.env.SKIP_INIT === 'true',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10) || 3306,
    database: process.env.DB_DATABASE,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  submission: {
    maxPerMinute:
      parseInt(process.env.MAX_SUBMISSION_PER_MINUTE ?? '10', 10) || 10,
  },
  init: {
    saUsername: process.env.INIT_SA_USERNAME ?? 'admin',
    saPassword: process.env.INIT_SA_PASSWORD ?? 'Admin@123456',
  },
});
