# Leverage Backend Neo

Backend service for **Leverage OJ** — an Online Judge platform for competitive programming courses and contests. This repository is a full rewrite of the original backend, built with NestJS and TypeORM.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [NestJS](https://nestjs.com/) |
| ORM | [TypeORM](https://typeorm.io/) |
| Database | MariaDB 10.11 |
| Cache / Queues | Redis 7 |
| Job Queue | [Bull](https://github.com/OptimalBits/bull) |
| Logging | [nestjs-pino](https://github.com/iamolegga/nestjs-pino) |
| Metrics | [Prometheus](https://prometheus.io/) |
| API Docs | Swagger / OpenAPI |

## Quick Start

```bash
# Local development: Node 22, pnpm, and a working Docker daemon are required.
cp .env.example .env
# Set the blank database/bootstrap/JWT secrets in .env before starting.
docker compose up -d --wait db redis  # loopback-only dependencies
pnpm install --frozen-lockfile
pnpm migration:run                   # first local database, including ELO SQL tables
pnpm judge:image                      # user code runs only in restricted containers
pnpm start:dev                        # all = HTTP + internal worker
```

The supplied production Compose is **API-only** and cannot judge jobs until a
trusted worker and shared test-case storage are provisioned; see
[the deployment guide](deploy/README.md).

## Development

```bash
# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env

# Start in dev mode (hot reload)
pnpm start:dev

# Build for production
pnpm build
pnpm start:prod
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | Runtime environment |
| `BASE_URL` | `http://localhost:3000` | Server public URL |
| `DB_HOST` | `localhost` | MariaDB host |
| `DB_DATABASE` | — | Database name |
| `DB_USERNAME` | — | Database user |
| `DB_PASSWORD` | — | Database password |
| `REDIS_HOST` | `localhost` | Redis host |
| `JWT_ACCESS_SECRET` | — | Access token signing secret |
| `JWT_REFRESH_SECRET` | — | Refresh token signing secret |

| `MAX_SUBMISSION_PER_MINUTE` | `10` | Per-user submission rate limit |
| `INIT_SA_USERNAME` | `admin` | Default SA account username |
| `INIT_SA_PASSWORD` | — | Explicitly set before first non-test startup; production requires ≥16 characters |

Full variable reference: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

## Database Migrations

TypeORM migrations are used to manage schema changes.

```bash
# Run all pending migrations (required before first start)
pnpm migration:run

# Generate a new migration from entity changes
pnpm migration:generate src/migrations/MigrationName

# Revert the last migration
pnpm migration:revert

# Show migration status
pnpm migration:show
```

> Local setup may run `pnpm migration:run` before starting the app. In production,
> a single API instance runs reviewed migrations during startup; rehearse upgrades
> on a restored clone and never race multiple migrating instances.

## API Documentation

Interactive Swagger UI is available at `/api/docs` when the server is running.  
See [`docs/API.md`](docs/API.md) for a structured route overview.

## Testing

```bash
# Run unit tests
pnpm test:unit

# Run integration tests (requires Docker for Testcontainers)
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run all tests (unit + integration)
pnpm test:all

# With coverage report
pnpm test:unit --coverage
```

## Security

- **JWT authentication**: short-lived access tokens (15m) + refresh tokens (7d) with rotation
- **Rate limiting**: submission throttling (configurable via `MAX_SUBMISSION_PER_MINUTE`)
- **NestJS Throttler**: global rate limiting on all API endpoints
- **Input validation**: all DTOs validated with `class-validator`
- **Password hashing**: bcrypt with configurable rounds
- **Anti-cheat**: suspicious submission detection module

## Project Structure

```
src/
├── config/              # Config loading & validation (Joi)
├── common/              # Guards, decorators, interceptors
├── database/            # TypeORM setup, entities, migrations
├── logger/              # Pino structured logging
└── modules/
    ├── auth/            # JWT authentication (access + refresh tokens)
    ├── user/            # User CRUD, bcrypt passwords, bulk import
    ├── problem/         # Problem CRUD, tag filtering, test data upload
    ├── submission/      # Code submissions, rate limiting, rejudge
    ├── heng/            # Judge service communication (Bull workers)
    ├── receive/         # Judge result processing, stats, leaderboard update
    ├── rank/            # Global Redis Sorted Set leaderboard
    ├── contest/         # Contests, real-time ranking, balloon tracking
    ├── course/          # Courses, student enrollment, submission export
    ├── compete/         # Bot battle system (Game / Gamer / Match)
    ├── media/           # File upload with MIME type validation
    ├── message/         # User-to-user messaging (inbox/outbox)
    ├── tag/             # Problem tags
    ├── setting/         # System settings
    ├── statistics/      # Aggregate statistics
    ├── notification/    # User notifications
    ├── suspicion/       # Anti-cheat / suspicious submission detection
    ├── health/          # Health check endpoint
    ├── metrics/         # Prometheus metrics endpoint
    ├── queue/           # Bull queue definitions
    ├── redis/           # Redis client service
    └── init/            # First-run initialization (SA account seeding)
```

For architecture details see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).  
For deployment instructions see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## License

MIT
