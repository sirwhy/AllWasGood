# Deploy on a VPS (Docker Compose)

This deploys the full stack — Postgres, Redis, web, worker, and a Caddy reverse-proxy with auto-HTTPS — on a single VPS.

## Prerequisites

- A VPS with public IPv4, ports 80 and 443 open (Hetzner, DigitalOcean, Vultr, OVH, etc.).
- A domain (e.g. `app.example.com`) pointing to the VPS via an A record.
- Docker + Docker Compose v2 installed.

## 1. Clone the repo

```bash
git clone https://github.com/sirwhy/AllWasGood.git
cd AllWasGood
```

## 2. Configure env

```bash
cp .env.example .env
```

Edit `.env` and at minimum set:

```ini
NEXT_PUBLIC_APP_URL=https://app.example.com
AUTH_SECRET=...                     # openssl rand -base64 32
CREDENTIAL_ENCRYPTION_KEY=...       # openssl rand -base64 32
DOMAIN=app.example.com              # used by Caddyfile

# Database / Redis are wired up by docker-compose.prod.yml automatically.
# DATABASE_URL=postgresql://postgres:postgres@postgres:5432/pippit?schema=public
# REDIS_URL=redis://redis:6379
```

## 3. Boot

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first start runs Prisma migrations automatically.

## 4. Verify

```bash
curl https://app.example.com/api/health
# {"ok":true,"timestamp":"...","service":"allwasgood-web"}
```

Visit `https://app.example.com`, sign up, and paste your provider API keys in **Settings → API Keys**.

## Logs

```bash
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f worker
```

## Updates

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Backups

Postgres data is in the `pgdata` Docker volume. Use `pg_dump` or your VPS's snapshot tool to back it up regularly.

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres pippit | gzip > backup-$(date +%F).sql.gz
```
