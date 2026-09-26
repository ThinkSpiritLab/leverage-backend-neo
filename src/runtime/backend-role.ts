export type BackendRole = 'all' | 'api' | 'worker';

/** Resolve once at module registration/bootstrap; reject typos rather than silently running all. */
export function getBackendRole(
  value: string | undefined = process.env.BACKEND_ROLE,
): BackendRole {
  if (value === undefined) return 'all';
  if (value === 'all' || value === 'api' || value === 'worker') return value;
  throw new Error(
    `Invalid BACKEND_ROLE ${JSON.stringify(value)}; expected all, api or worker`,
  );
}

export function runsWorkers(role: BackendRole = getBackendRole()): boolean {
  return role === 'all' || role === 'worker';
}

export function runsHttp(role: BackendRole = getBackendRole()): boolean {
  return role === 'all' || role === 'api';
}
