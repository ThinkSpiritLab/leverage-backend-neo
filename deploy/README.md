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
└── botzone-neo/            ← adjust path in docker-compose.prod.yml if different
```

## Step-by-Step Deployment

### 1. Clone the repos

```bash
git clone https://github.com/your-org/leverage-backend-neo.git
git clone https://github.com/your-org/leverage-frontend-neo.git
git clone https://github.com/your-org/botzone-neo.git
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

> ⚠️ Never commit `.env.prod` to git.

### 3. Update nginx config

Edit `deploy/nginx.conf`, replace `YOUR_DOMAIN` with your actual domain:

```bash
sed -i 's/YOUR_DOMAIN/yourdomain.com/g' deploy/nginx.conf
```

### 4. Adjust botzone path (if needed)

If botzone-neo is not at `/Users/yuzhe/projects/botzone-neo`, edit `docker-compose.prod.yml`:

```yaml
botzone:
  build:
    context: /path/to/botzone-neo
```

Also update the `env_file` path.

### 5. Start all services

```bash
cd leverage-backend-neo
docker compose -f docker-compose.prod.yml up -d --build
```

Check logs:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

### 6. First-run: database migrations

Wait for the backend to be healthy, then run migrations:

```bash
docker compose -f docker-compose.prod.yml exec backend node -e "
const { AppDataSource } = require('./dist/data-source');
AppDataSource.initialize().then(() => AppDataSource.runMigrations()).then(() => process.exit(0));
"
```

Or restore from a dump:
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  mysql -u leverage -p leverage < backup.sql
```

### 7. SSL with Certbot

```bash
# Install certbot
apt install -y certbot

# Stop nginx temporarily (or use --webroot / DNS challenge)
docker compose -f docker-compose.prod.yml stop nginx

# Obtain cert
certbot certonly --standalone -d yourdomain.com

# Copy certs to deploy/certs/
mkdir -p deploy/certs
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem deploy/certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem deploy/certs/

# Uncomment the HTTPS server block in deploy/nginx.conf
# Then restart nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

> 💡 **Auto-renew:** Add a cron job:  
> `0 3 * * * certbot renew --quiet && docker compose -f /opt/leverage/leverage-backend-neo/docker-compose.prod.yml restart nginx`

## Updating

```bash
cd leverage-backend-neo
git pull
docker compose -f docker-compose.prod.yml up -d --build backend
```

For frontend updates:
```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

## Troubleshooting

| Issue | Command |
|-------|---------|
| View all logs | `docker compose -f docker-compose.prod.yml logs -f` |
| Restart a service | `docker compose -f docker-compose.prod.yml restart backend` |
| DB shell | `docker compose -f docker-compose.prod.yml exec db mysql -u leverage -p` |
| Redis shell | `docker compose -f docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD` |
| Health check | `curl https://yourdomain.com/api/health/ready` |
