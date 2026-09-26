import { getBackendRole, runsHttp, runsWorkers } from './backend-role';

describe('backend role', () => {
  const original = process.env.BACKEND_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.BACKEND_ROLE;
    else process.env.BACKEND_ROLE = original;
  });

  it('defaults to all and uses the environment when omitted', () => {
    delete process.env.BACKEND_ROLE;
    expect(getBackendRole()).toBe('all');
    process.env.BACKEND_ROLE = 'worker';
    expect(getBackendRole()).toBe('worker');
    expect(runsHttp()).toBe(false);
    expect(runsWorkers()).toBe(true);
  });

  it.each([
    ['all', true, true],
    ['api', true, false],
    ['worker', false, true],
  ] as const)('%s runs HTTP=%s workers=%s', (role, http, workers) => {
    expect(getBackendRole(role)).toBe(role);
    expect(runsHttp(role)).toBe(http);
    expect(runsWorkers(role)).toBe(workers);
  });

  it.each(['', 'API', 'workers', 'worker ', 'none'])(
    'fails fast on invalid value %j',
    (value) => {
      expect(() => getBackendRole(value)).toThrow(/BACKEND_ROLE/);
    },
  );
});
