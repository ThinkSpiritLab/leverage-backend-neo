# Agent guide — leverage-backend-neo

## Scope and source of truth

This repository is the NestJS backend for Leverage OJ: problems, submissions,
contests, courses, account management, and bot/human matches. The companion UI is
`ThinkSpiritLab/leverage-frontend-neo`, normally cloned beside this repository.

Read this guide before changing code. Treat `package.json`, registered modules,
controllers, entities, and migrations as authoritative when older documentation
or comments disagree. This file is named `agent.md` intentionally; tools that only
auto-discover `AGENTS.md` need to be pointed to this file explicitly.

## Architecture map

- `src/main.ts`: Express/Nest bootstrap, validation, HTTP middleware, Swagger,
  shutdown, and an Express-level Bull Board authentication boundary.
- `src/app.module.ts`: application composition, global throttling and audit logging.
- `src/config/`: environment mapping and Joi validation.
- `src/database/`: TypeORM connection and entities; `src/migrations/`: schema
  migrations. `data-source.ts` is the separate CLI migration entry point.
- `src/modules/auth/` and `src/common/guards/`: JWT, contest JWT, user API keys,
  and role checks. Frontend route guards are not backend authorization.
- `src/modules/submission/`: submission creation, querying and rejudging.
- `src/modules/judge-runtime/`: in-repository OJ/match worker, Docker sandbox,
  runtime languages and status contract. User programs run only in restricted
  Docker containers, never in the NestJS process.
- `src/modules/receive/`: transactional finalization, current-attempt checks,
  rejudge accounting and post-commit ranking publication.
- `src/modules/compete/`: game/bot CRUD, rooms, matches, ELO, playground, human
  turns and automatic matching. Pending turns and cross-instance SSE events use
  Redis; only live SSE writers/waits stay in the local process.
- `src/modules/redis/`, `rank/`, `queue/`: Redis access, ranking and Bull queues
  (`@nestjs/bull` / `bull`). Role-specific job consumers are registered only in
  `all` or `worker`; API roles coordinate maintenance via bounded Redis leases.
- `src/mcp/leverage-mcp.ts`: separate MCP client-facing entry point.

Trace registered providers and the job name before changing queue behavior;
legacy `judge`/external callback jobs must be drained before upgrading.

## Development and checks

Use pnpm and retain `pnpm-lock.yaml`. Install explicitly with
`pnpm install --frozen-lockfile`; do not silently regenerate the lockfile.

- `pnpm start:dev`: backend development server, port 3000 by default.
- `pnpm build`: Nest compilation.
- `pnpm test:unit --runInBand`: unit project; narrow with `--runTestsByPath`.
- `pnpm test:accounting`, `pnpm test:migrations`: disposable real MariaDB checks;
  require Docker. Migration data can use `TEST_TMPDIR` on an external disk.
- `pnpm exec eslint "{src,apps,libs,test}/**/*.ts"`: non-fixing lint check.
  **`pnpm lint` includes `--fix` and modifies files.**
- `pnpm judge:image`: builds the restricted judge image from an empty context.
- `pnpm test:e2e`: builds that image, then runs MariaDB/Redis Testcontainers
  (including the real Docker OJ/match path); requires Docker.
  Do not launch Docker or external services without the operator's approval.
- `pnpm test:integration`: SQLite integration and the legacy SQLite app suite;
  no Docker. Use Node 22 and a matching `better-sqlite3` native binding. The
  container HTTP suites belong to `pnpm test:e2e`, which owns their global setup.
- `pnpm migration:show`, `pnpm migration:run`, `pnpm migration:revert`: operate
  on the configured database. Confirm the target before any write.
- `pnpm mcp`: run the MCP entry point.

The backend requires MariaDB/MySQL-compatible storage and Redis. Review
`.env.example` and `src/config/validation.schema.ts`; never copy example secrets
into production. Do not start the app against an unknown database: development
uses `synchronize`, while production automatically runs migrations at startup.
Seed/clear scripts mutate data and are not routine verification steps.
See `docs/HARDENING.md` for migration order and rollback boundaries. The
provided production Compose starts an API but no Docker-capable worker; do not
accept judge jobs there until worker access to Docker, DB, Redis and testcase
storage is provisioned and verified.

## Change boundaries

1. Keep the modular monolith unless a concrete requirement justifies a new
   service, abstraction layer or dependency. Prefer a focused domain service to
   adding more unrelated responsibilities to `CompeteService`.
2. Check authorization at the server boundary and again where ownership matters.
   Authentication alone does not authorize a match, gamer, submission or course.
   Only documented trusted backend calls may create/delete evaluator jobs.
3. Treat judge completion as at-least-once delivery. Bind a result to its current
   attempt/job, make finalization atomic, and test duplicate/concurrent deliveries
   and rejudging. Redis writes are not rolled back by a SQL transaction.
4. Entity changes need forward migrations. Check both a fresh schema and the
   upgrade path on MariaDB; development `synchronize` and SQLite metadata patches
   cannot prove production migration correctness. Do not rewrite applied migrations.
5. Keep response shapes aligned with the frontend API wrappers and types. Do not
   silently change role aliases, status numbers, pagination or contest-token scope.
6. Keep untrusted programs inside restricted Docker containers. Never mount the
   daemon socket, host paths or backend secrets into student/author code.
7. Use targeted regression tests for changed behavior. Explicitly distinguish
   source inspection, mocked tests and real database/judge/browser verification.
8. Do not commit secrets, `.env`, uploads, judge data, dependency trees or generated
   build/test output. Do not enable or dispatch disabled CI/deploy workflows as
   part of an ordinary local change.

## Documentation

Start with `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`,
`docs/BACKEND_ROLES.md`, `docs/JUDGE_SANDBOX.md`, `docs/API.md` and
`docs/MCP_SETUP.md`, but verify their claims against the active source. Keep this
guide procedural; put dated audit findings
and temporary task progress in a separate report, not here.
