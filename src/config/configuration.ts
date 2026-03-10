export default () => ({
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
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  heng: {
    baseUrl: process.env.HENG_BASE_URL,
    ak: process.env.HENG_AK,
    sk: process.env.HENG_SK,
    allowInsecureTls: process.env.HENG_ALLOW_INSECURE_TLS === 'true',
  },
  submission: {
    maxPerMinute:
      parseInt(process.env.MAX_SUBMISSION_PER_MINUTE ?? '10', 10) || 10,
  },
  botzone: {
    enabled: process.env.BOTZONE_ENABLED === 'true',
    baseUrl: process.env.BOTZONE_BASE_URL ?? '',
    apiKey: process.env.BOTZONE_API_KEY ?? '',
    callbackToken: process.env.BOTZONE_CALLBACK_TOKEN ?? '',
    defaultProblemId: process.env.BOTZONE_DEFAULT_PROBLEM_ID ?? '',
    pollIntervalMs:
      parseInt(process.env.BOTZONE_POLL_INTERVAL_MS ?? '30000', 10) || 30_000,
  },
  init: {
    saUsername: process.env.INIT_SA_USERNAME ?? 'admin',
    saPassword: process.env.INIT_SA_PASSWORD ?? 'Admin@123456',
  },
});
