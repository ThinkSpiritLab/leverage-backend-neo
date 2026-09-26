# Deploying the consistency and authorization fixes

## Before deploying

1. Back up the database and rehearse migrations on a restored copy. Production
   must retain `synchronize: false`.
2. Pause new submissions/matches, drain old judge queues and let active matches finish
   before replacing API and worker processes together. Old external callbacks are
   no longer accepted; reconcile unfinished historical attempts explicitly.
3. Build and pin the internal `JUDGE_IMAGE` on the worker host; review Docker daemon
   permissions and sandbox limits as described in `JUDGE_SANDBOX.md`.
4. In single-API production mode, reviewed migrations run during API startup.
   Never run the CLI migration command concurrently with an active API fleet;
   if an attended pre-start run is chosen, verify the target and backup first.

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

- Internal OJ results enter `ReceiveService.finalize`. SQL row locks own
  deduplication, attempt checks, result writes and statistics. Ranking cache
  publication happens after SQL commit, and retries can republish without
  counting a result twice. Redis is not a transaction coordinator.
- Creation and rejudge use internal worker dispatch. Rejudge retains the previous
  counted result until a new attempt settles and refuses stale attempts. Status
  polling reads the persisted submission state.
- Authentication reads current account status/role, including manual JWT entry
  points for human turns. Renderer messages and moves are restricted to their
  owning iframe/player.
- Pending human turns, responses and game-over replay are in shared Redis;
  API instances route SSE events there. Local waiters and open SSE writers remain
  process-local. Automatic matching uses per-game leases, not exactly-once writes.
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

`pnpm test:e2e` builds the judge image and runs MariaDB/Redis HTTP suites with
real Docker OJ/match cases; it does not include SQLite. Run
`pnpm test:integration` separately for SQLite; on this repository's supported
Node 22, its native `better-sqlite3` binding must be available. Report skipped
cases separately from passed cases.

Frontend checks: `pnpm test:regression`, `pnpm test:botzone` (build and real
Chrome renderer probe), and the Playwright suite. Those browser fixtures mock
API/SSE and do not replace the backend's real Docker E2E or production-proxy QA.
