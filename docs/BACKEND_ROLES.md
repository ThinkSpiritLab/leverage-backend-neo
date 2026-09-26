# Backend startup roles

One NestJS repository and data model; `BACKEND_ROLE=all|api|worker` (default `all`). `all` combines HTTP, Bull consumers and the internal Docker judge for a simple single-process setup. `api` listens on HTTP but does not consume judge jobs. `worker` runs a Nest application context, never calls `listen()`, excludes `InitModule`, and disables TypeORM schema synchronization and automatic migrations. Bull uses the shared Redis queue; this is not a second public judge API or a global leader election.

## Run

Use Node 22 and pnpm. Copy `.env.example` to `.env` for local development, supply a disposable MariaDB and Redis, then `pnpm build`. The actual compiler output is `dist/src/main.js` (migrations in `dist/src/migrations/`). From the repository root:

- `pnpm start:prod` (default `all`, or pass `BACKEND_ROLE=...` in the environment)
- `pnpm start:api` (`api` role)
- `pnpm start:worker` (`worker` role; no HTTP port)
- `pnpm start:dev` (same default `all`; set `BACKEND_ROLE` to change it)

Runtime `dotenv` loads `.env` before module decorators register providers. Process environment overrides `.env`; `.env.prod.example` is only a template, not an automatically loaded file. `BACKEND_ROLE` accepts only the three exact lowercase values and invalid values fail startup. Configure the same MariaDB/Redis target and compatible secrets across processes; do not use example credentials in production. See `agent.md` for the test commands.

## Startup ownership and migration safety

`all` and `api` preserve the legacy **single-instance** behavior: development TypeORM `synchronize` and production `migrationsRun`, plus `InitModule` (unless `SKIP_INIT=true`). `worker` does none of these startup schema/account/settings writes. The migration glob resolves from the emitted database module (`dist/src/migrations/*.js`) rather than the former nonexistent `dist/migrations/*.js`. Production schema migrations still require rehearsal and backup per `docs/HARDENING.md`.

**Do not horizontally scale HTTP roles while automatic migrations or development synchronization are enabled.** For future multi-instance deployment, run reviewed migrations once as a separately controlled pre-start step, after backup and with the API/worker fleet paused or compatibility-gated. Then make HTTP startups migration-free by an explicit configuration change, and make bootstrap account/settings initialization a one-time attended action. Do not let every replica race the migration ledger or SA initialization. No such multi-instance migration switch is implemented by this slice; multiple workers may consume Bull jobs, and per-game Redis leases coordinate periodic maintenance without a global primary. Human turns and SSE event routing already use shared Redis state, but automatic match creation is not itself an exactly-once transaction.

Workers still import the shared application graph and acquire database/Redis connections; absence of a listener is not a network isolation boundary. Controller routes are not exposed by the worker context. The internal submission/match Bull consumers are registered only when `runsWorkers()`; compete maintenance stays injectable but does not tick on `worker`. `pnpm test:e2e` verifies independent API and Worker processes against disposable MariaDB, authenticated Redis and real Docker jobs. Redis leases coordinate per-game automatic matching on HTTP roles, and human-turn state/SSE routing is shared across API instances; the lease does not provide exactly-once database effects. Untrusted code runs in restricted Docker containers, never in Nest. The trusted worker needs Docker daemon access, but the submitted program must receive neither that socket nor backend credentials. A Docker-less API role cannot execute a judge job by itself. The supplied production Compose starts no Docker-capable worker; provision and verify one separately before accepting submissions or matches.
