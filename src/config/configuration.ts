export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  skipInit: process.env.SKIP_INIT === 'true',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_DATABASE,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  heng: {
    baseUrl: process.env.HENG_BASE_URL,
    ak: process.env.HENG_AK,
    sk: process.env.HENG_SK,
    allowInsecureTls: process.env.HENG_ALLOW_INSECURE_TLS === 'true',
  },
  submission: {
    maxPerMinute: parseInt(process.env.MAX_SUBMISSION_PER_MINUTE, 10) || 10,
  },
})
