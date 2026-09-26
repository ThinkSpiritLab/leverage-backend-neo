# Leverage OJ — Production Deployment Guide

## Prerequisites

- Docker ≥ 24 & Docker Compose v2 (`docker compose` or `docker-compose`)
- A domain name pointing to your server
- (Optional) Certbot for SSL

## Project Layout Expected on Server

```
/opt/leverage/
├── leverage-backend-neo/   ← this repo
├── leverage-frontend-neo/

```

## Step-by-Step Deployment

### 1. Clone the repos

```bash
git clone https://github.com/your-org/leverage-backend-neo.git
git clone https://github.com/your-org/leverage-frontend-neo.git

```

### 2. Configure environment variables

```bash
# Backend
cd leverage-backend-neo
cp .env.prod.example .env.prod
nano .env.prod   # fill in all CHANGE_ME values

# Frontend
cd ../leverage-frontend-neo
cp .env.prod.example .env.prod
nano .env.prod   # set NUXT_PUBLIC_API_BASE=https://YOUR_DOMAIN/api
```

> ⚠️ Never commit `.env.prod` to git. Pass it explicitly with
> `docker compose --env-file .env.prod`: Compose service `env_file` alone does
> not provide values for `${...}` interpolation in the database/Redis services.

### 3. Update nginx config

Edit `deploy/nginx.conf`, replace `YOUR_DOMAIN` with your actual domain:

```bash
sed -i 's/YOUR_DOMAIN/yourdomain.com/g' deploy/nginx.conf
```

### 4. Provision the internal judge worker

Build and pin `JUDGE_IMAGE` as described in `docs/JUDGE_SANDBOX.md`. This Compose
file runs the backend as `BACKEND_ROLE=api`: it does **not** provide a Docker CLI,
daemon access, or a worker. A separate trusted `BACKEND_ROLE=worker` process
needs access to the **same MariaDB, Redis and test-case files**; the Compose
database/Redis are private and are not reachable from an unconfigured host worker.
Do not accept OJ submissions or Bot matches until that network/storage/worker
path is provisioned and verified. Never mount the Docker socket or business
secrets into the submitted program's container. This is a release gate, not a
promise that the current Compose file deploys a complete judge.

### 5. Start the HTTP dependencies (after the worker gate is planned)

```bash
cd leverage-backend-neo
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Check logs:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f
```

### 6. First-run: database migrations

The single production API runs reviewed TypeORM migrations during startup,
before it listens. The former `dist/data-source` command was not present in the
image and must not be used. Back up and rehearse migrations on a restored clone
first; pause existing workers/queue intake across a versioned upgrade. Do not
start multiple migrating API replicas concurrently. See `docs/HARDENING.md`.

For a restore, use an offline database or a disposable clone; verify the backup
and rollback procedure in `docs/HARDENING.md` before the API starts. Do not pipe
a dump into a live writable service.

### 7. SSL with Certbot

```bash
# Install certbot
apt install -y certbot

# Stop nginx temporarily (or use --webroot / DNS challenge)
docker compose --env-file .env.prod -f docker-compose.prod.yml stop nginx

# Obtain cert
certbot certonly --standalone -d yourdomain.com

# Copy certs to deploy/certs/
mkdir -p deploy/certs
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem deploy/certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem deploy/certs/

# Uncomment the HTTPS server block in deploy/nginx.conf
# Then restart nginx
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d nginx
```

Renewal must update the mounted `deploy/certs` files before reloading nginx;
restarting nginx alone after `certbot renew` leaves the copied certificates stale.


## Updating

```bash
cd leverage-backend-neo
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build backend
```

For frontend updates:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build frontend
```

## Troubleshooting

| Issue | Command |
|-------|---------|
| View all logs | `docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f` |
| Restart a service | `docker compose --env-file .env.prod -f docker-compose.prod.yml restart backend` |
| DB shell | `docker compose --env-file .env.prod -f docker-compose.prod.yml exec db mysql -u leverage -p` |
| Redis shell | `docker compose --env-file .env.prod -f docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD` |
| Health check | `curl https://yourdomain.com/api/health/ready` |
