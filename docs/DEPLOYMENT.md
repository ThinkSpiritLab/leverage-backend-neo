# Deployment Guide

## Prerequisites

- Docker ≥ 24 and Docker Compose v2
- (Optional) A domain with TLS certificate for production
- A running [heng-controller](https://github.com/joint-online-judge/heng-controller) instance

---

## Docker Compose Deployment

### 1. Clone the repository

```bash
git clone <repo-url>
cd leverage-backend-neo
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values (see [Environment Variables](#environment-variables) below).

### 3. Build and start

```bash
docker compose up -d --build
```

This starts three containers:

| Service | Image | Port |
|---------|-------|------|
| `app` | Built from `Dockerfile` | 3000 |
| `db` | `mariadb:10.11` | (internal) |
| `redis` | `redis:7-alpine` | (internal) |

The app waits for both `db` and `redis` to pass health checks before starting.

### 4. Verify

```bash
curl http://localhost:3000/health
# → { "status": "ok", ... }
```

First startup automatically creates the SA account using `INIT_SA_USERNAME` / `INIT_SA_PASSWORD`.

### 5. View logs

```bash
docker compose logs -f app
```

---

## Environment Variables

Full reference — copy from `.env.example`:

```dotenv
# App
PORT=3000
NODE_ENV=production
SKIP_INIT=false

# Database
DB_HOST=db
DB_PORT=3306
DB_DATABASE=leverage
DB_USERNAME=leverage
DB_PASSWORD=<strong-password>
DB_ROOT_PASSWORD=<strong-root-password>   # docker-compose only

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT — generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=<random-secret>
JWT_REFRESH_SECRET=<random-secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# heng-controller
HENG_BASE_URL=https://your-heng-controller.example.com
HENG_AK=your_access_key
HENG_SK=your_secret_key
HENG_ALLOW_INSECURE_TLS=false

# Submission rate limit
MAX_SUBMISSION_PER_MINUTE=10

# First-run SA account
INIT_SA_USERNAME=admin
INIT_SA_PASSWORD=Admin@123456
```

> **Security**: Always use strong, unique secrets for `JWT_*_SECRET` and `DB_*_PASSWORD` in production.

---

## heng-controller Configuration

The backend communicates with `heng-controller` via HMAC-signed HTTP requests.

| Variable | Description |
|----------|-------------|
| `HENG_BASE_URL` | Full base URL of heng-controller, e.g. `https://heng.example.com` |
| `HENG_AK` | Access key (public identifier) |
| `HENG_SK` | Secret key (used for HMAC-SHA256 signing) |
| `HENG_ALLOW_INSECURE_TLS` | Set `true` only in dev with self-signed certs |

The backend also exposes two callback endpoints that heng-controller must be able to reach:

```
POST /heng/update/:submissionId/:judgeId
POST /heng/finish/:submissionId/:judgeId
```

Configure your heng-controller to call back to your backend's public URL.

---

## Nginx Reverse Proxy

Example Nginx config for serving the backend behind HTTPS:

```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Recommended SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Required for SSE / long-poll (status polling)
        proxy_read_timeout 120s;
        proxy_buffering    off;
    }
}
```

---

## Production Recommendations

### Run as a single process

NestJS runs best as a **single Node.js process** behind a reverse proxy. Do **not** use `PM2 cluster` mode — BullMQ workers rely on shared in-process state and cluster mode can cause duplicate job processing.

```bash
# Correct: single process
node dist/main.js

# Or via docker compose (already single-process)
docker compose up -d app
```

### Health check & restart policy

The `docker-compose.yml` sets `restart: unless-stopped` for all services. For more control use a process supervisor (systemd, supervisord) or a container orchestrator (Kubernetes).

### Log management

Logs are emitted as structured JSON (Pino). Pipe them to a log aggregator:

```bash
docker compose logs -f app | your-log-shipper
```

### Metrics & monitoring

Prometheus metrics are at `/metrics`. Connect to Grafana via a Prometheus scrape job:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: leverage-backend
    static_configs:
      - targets: ['api.example.com:3000']
    scheme: https
```

### Database backups

Schedule regular MariaDB dumps:

```bash
docker exec leverage-backend-neo-db-1 \
  mysqldump -u leverage -p<password> leverage \
  > backup-$(date +%Y%m%d).sql
```

---

## Updating

```bash
git pull
docker compose up -d --build app
```

TypeORM runs migrations automatically on startup (`synchronize: true` in development; use proper migrations in production if schema drift is a concern).
