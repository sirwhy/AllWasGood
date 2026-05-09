# Custom Domain

## Railway

1. In the project canvas, open the **web** service → **Settings → Networking → Custom Domain**.
2. Enter your domain (e.g. `app.example.com`) and click **Add**.
3. Railway shows a CNAME target like `xxxxx.up.railway.app`.
4. On your DNS provider (Cloudflare, Namecheap, GoDaddy, …), add a record:
   - **Type:** `CNAME`
   - **Name:** `app` (or whatever subdomain you want)
   - **Value:** the CNAME target Railway gave you
   - **TTL:** Auto / 300
5. Wait 1–10 minutes for DNS to propagate. Railway auto-provisions an HTTPS cert.
6. In Railway's **Variables**, set `NEXT_PUBLIC_APP_URL=https://app.example.com` and redeploy.

### Apex / root domain (`example.com` without `www`)

Most DNS providers don't allow CNAME on the apex. Use Cloudflare (which supports CNAME flattening) — or use an A record pointing at Railway's anycast IPs (Railway's docs list these).

## VPS

1. Add an A record at your DNS provider:
   - **Type:** `A`
   - **Name:** `app` (or `@` for root)
   - **Value:** your VPS public IPv4
2. Set `DOMAIN=app.example.com` in `.env`.
3. Restart Caddy: `docker compose -f docker-compose.prod.yml restart caddy`. It auto-fetches a Let's Encrypt cert on first request.

## Wildcard

For `*.example.com`, configure DNS-01 challenge with Caddy or use Cloudflare's universal SSL.
