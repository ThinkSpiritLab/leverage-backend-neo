import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  SKIP_INIT: Joi.boolean().default(false),
  BASE_URL: Joi.string().default('http://localhost:3000'),

  // Database (required)
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(3306),
  DB_DATABASE: Joi.string().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // JWT (required in non-test environments)
  JWT_ACCESS_SECRET: Joi.string().when('NODE_ENV', {
    is: 'test',
    then: Joi.string().default('test-access-secret'),
    otherwise: Joi.string().required(),
  }),
  JWT_REFRESH_SECRET: Joi.string().when('NODE_ENV', {
    is: 'test',
    then: Joi.string().default('test-refresh-secret'),
    otherwise: Joi.string().required(),
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Heng judge service
  HENG_BASE_URL: Joi.string().uri().optional(),
  HENG_AK: Joi.string().optional(),
  HENG_SK: Joi.string().optional(),
  HENG_ALLOW_INSECURE_TLS: Joi.boolean().default(false),

  // Submission throttle
  MAX_SUBMISSION_PER_MINUTE: Joi.number().default(10),

  // Botzone external judge provider (optional)
  BOTZONE_ENABLED: Joi.boolean().default(false),
  BOTZONE_BASE_URL: Joi.string().uri().optional(),
  BOTZONE_API_KEY: Joi.string().optional(),
  BOTZONE_CALLBACK_TOKEN: Joi.string().optional(),
  BOTZONE_DEFAULT_PROBLEM_ID: Joi.string().optional(),
  BOTZONE_POLL_INTERVAL_MS: Joi.number().default(30000),
});
