import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  PORT: Joi.number().default(3000),
  BACKEND_ROLE: Joi.string().valid('all', 'api', 'worker').default('all'),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  SKIP_INIT: Joi.boolean().default(false),
  BASE_URL: Joi.string().default('http://localhost:3000'),
  JUDGE_IMAGE: Joi.string().default('leverage-judge-runtime:local'),
  TEST_CASES_PATH: Joi.string().default('/tmp/testcases'),
  JUDGE_MAX_MATCH_MS: Joi.number().integer().min(1000).max(600000).default(300000),
  JUDGE_MAX_ROUNDS: Joi.number().integer().min(1).max(10000).default(1000),

  // Database (required)
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(3306),
  DB_DATABASE: Joi.string().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

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

  // Submission throttle
  MAX_SUBMISSION_PER_MINUTE: Joi.number().default(10),

});
