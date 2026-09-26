module.exports = {
  displayName: 'e2e',
  // Only match our new E2E specs (excludes the legacy app.e2e.spec.ts which uses SQLite)
  testMatch: ['**/test/e2e/**/*.e2e.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/test/e2e/app.e2e.spec.ts$'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 120000,
  // Run sequentially: containers are shared, one DB connection pool at a time
  maxWorkers: 1,
  // globalSetup: starts containers and sets env vars BEFORE test files are imported
  // (needed because ConfigModule.forRoot validates env at import/module-load time)
  globalSetup: './test/e2e/global-setup.ts',
  globalTeardown: './test/e2e/global-teardown.ts',
}
