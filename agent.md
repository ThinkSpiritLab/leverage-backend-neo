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
- `src/modules/heng/`: Heng HTTP adapter, callback endpoints, judge TX/RX workers.
- `src/modules/receive/`: Heng result persistence, statistics and ranking updates.
- `src/modules/botzone/`: alternate judge adapter, callback finalization and polling.
- `src/modules/compete/`: game/bot CRUD, rooms, matches, ELO, playground, human
  turns and automatic matching. `HumanTurnService` keeps pending turns and SSE
  clients in process memory, so do not assume arbitrary multi-instance routing.
- `src/modules/redis/`, `rank/`, `queue/`: Redis access, ranking and Bull queues.
  The active queue integration is **Bull** (`@nestjs/bull` / `bull`), despite
  BullMQ references in comments/docs and the additional `bullmq` dependency.
- `src/mcp/leverage-mcp.ts`: separate MCP client-facing entry point.

Trace the registered implementation before editing: the active `JudgeTxWorker`
also handles `compete` jobs; `CompeteTxWorker` is not registered in `CompeteModule`.

## Development and checks

Use pnpm and retain `pnpm-lock.yaml`. Install explicitly with
`pnpm install --frozen-lockfile`; do not silently regenerate the lockfile.

- `pnpm start:dev`: backend development server, port 3000 by default.
- `pnpm build`: Nest compilation.
- `pnpm test:unit --runInBand`: unit project; narrow with `--runTestsByPath`.
- `pnpm exec eslint "{src,apps,libs,test}/**/*.ts"`: non-fixing lint check.
  **`pnpm lint` includes `--fix` and modifies files.**
- `pnpm test:e2e`: MariaDB/Redis Testcontainers suite, requires Docker.
  Do not launch Docker or external services without the operator's approval.
- `pnpm test:integration` currently matches both integration and `test/e2e`
  files without the dedicated E2E global setup. Inspect the selected suite
  before treating this command as a standalone SQLite-only test.
- `pnpm migration:show`, `pnpm migration:run`, `pnpm migration:revert`: operate
  on the configured database. Confirm the target before any write.
- `pnpm mcp`: run the MCP entry point.

The backend requires MariaDB/MySQL-compatible storage and Redis. Review
`.env.example` and `src/config/validation.schema.ts`; never copy example secrets
into production. Do not start the app against an unknown database: development
uses `synchronize`, while production automatically runs migrations at startup.
Seed/clear scripts mutate data and are not routine verification steps.

## Change boundaries

1. Keep the modular monolith unless a concrete requirement justifies a new
   service, abstraction layer or dependency. Prefer a focused domain service to
   adding more unrelated responsibilities to `CompeteService`.
2. Check authorization at the server boundary and again where ownership matters.
   Authentication alone does not authorize a match, gamer, submission or course.
   Callback routes need explicit server-to-server authentication; decorators and
   comments are not proof that it is enforced.
3. Treat judge completion as at-least-once delivery. Bind a result to its current
   attempt/job, make finalization atomic, and test duplicate/concurrent callbacks
   and rejudging. Redis writes are not rolled back by a SQL transaction.
4. Entity changes need forward migrations. Check both a fresh schema and the
   upgrade path on MariaDB; development `synchronize` and SQLite metadata patches
   cannot prove production migration correctness. Do not rewrite applied migrations.
5. Keep response shapes aligned with the frontend API wrappers and types. Do not
   silently change role aliases, status numbers, pagination or contest-token scope.
6. Keep untrusted programs inside the external judge boundary. Do not run submitted
   code in this application's process or weaken renderer/sandbox isolation.
7. Use targeted regression tests for changed behavior. Explicitly distinguish
   source inspection, mocked tests and real database/judge/browser verification.
8. Do not commit secrets, `.env`, uploads, judge data, dependency trees or generated
   build/test output. Do not enable or dispatch disabled CI/deploy workflows as
   part of an ordinary local change.

## Documentation

Start with `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`,
`docs/HENG.md`, `docs/API.md` and `docs/MCP_SETUP.md`, but verify their claims
against the active source. Keep this guide procedural; put dated audit findings
and temporary task progress in a separate report, not here.
