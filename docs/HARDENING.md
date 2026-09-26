# Deploying the consistency and authorization fixes

## Before deploying

1. Back up the database and rehearse migrations on a restored copy. Production
   must retain `synchronize: false`.
2. Pause new submissions/matches, drain judge queues and let active matches finish
   before replacing API and worker processes together. Old in-flight callbacks
   do not have the new attempt identity and callback authentication contract.
3. Configure a nonempty `BOTZONE_CALLBACK_TOKEN`. Missing callback credentials
   now fail closed. OJ callback URLs carry an attempt-scoped HMAC; game/human
   callbacks use the existing shared callback credential. Do not log query tokens
   at the reverse proxy or forward callback URLs to clients.
4. Run `pnpm migration:run` against the intended database, then start the new
   backend/workers and deploy the frontend with the supplied Nginx SSE location.

The additive migration supplies missing entity columns and runtime tables. It
preserves existing objects created by development `synchronize`; its `down`
intentionally does not drop these objects. Application rollback should retain
these additive columns. Destructive schema rollback needs a reviewed backup
restore or a separate migration, not an automatic `DROP`.

`judgedStatus` stores the result already reflected in counters; `judgeAttempt`
identifies the current dispatch. Pending legacy submissions are not assigned a
historical counted result automatically. The migration does not reconstruct
previously corrupted statistics or ELO history. Reconcile historical data from
judge logs/backups separately if those bugs affected an existing deployment.

## Implementation boundaries

- Heng and Botzone normalize into `ReceiveService.finalize`. SQL row locks own
  deduplication, attempt checks, result writes and statistics. Ranking cache
  publication happens after SQL commit, and retries can republish without
  counting a result twice. Redis is not a transaction coordinator.
- Creation and rejudge share provider dispatch. Rejudge retains the previous
  counted result until a new attempt settles, clears the old external job and
  refuses stale callbacks. Status polling reads the persisted submission state.
- Authentication reads current account status/role, including manual JWT entry
  points for human turns. Renderer messages and moves are restricted to their
  owning iframe/player.
- Human-turn waiters and SSE remain process-local. Operate a single backend
  instance for this feature until cross-instance routing is explicitly designed.
- Existing contest scoring is preserved; these changes fix distinct solved
  counts and result replay rather than introducing a different scoring system.

## Reproducible checks

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsc --noEmit
pnpm test:unit --runInBand
pnpm test:accounting
pnpm test:migrations
```

The last two commands require Docker and remove their temporary containers.
`test:migrations` supports `TEST_TMPDIR=/path/on/external/disk` for temporary
MariaDB data. It checks fresh and legacy-upgrade paths, all entity columns and
selected ORM/raw-SQL business operations; it is not a production restored-clone
or full index/default/foreign-key zero-drift certification.

`pnpm test:e2e` includes both real MariaDB/Redis tests and an older SQLite test
suite. The latter requires the native `better-sqlite3` build, which pnpm may block
until explicitly approved. Do not report a partial run or skipped suite as green.

Frontend checks: `pnpm build` and `pnpm test:regression`. The regression script
executes refresh/401 and polling behavior, and checks SSE/iframe source contracts;
it does not replace real-browser and deployed-proxy acceptance.
