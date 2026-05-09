# Deploy to Railway

Railway is the recommended hosting platform — it auto-provisions Postgres + Redis and runs both the web and worker services from this repo.

## 1. Create the project

1. Sign in to <https://railway.com>.
2. **New Project → Deploy from GitHub repo** and select this repo.
3. Railway will automatically pick up `railway.json` and start the **web** service.

## 2. Add Postgres and Redis

In your project canvas:
- **+ New → Database → PostgreSQL** — Railway injects `DATABASE_URL` into every service in the project.
- **+ New → Database → Redis** — Railway injects `REDIS_URL`.

## 3. Add the worker service

1. **+ New → GitHub Repo → AllWasGood**.
2. In the new service's **Settings**:
   - Set **Watch Paths** to `src/worker/**` (so this service redeploys only on worker changes; web is independent).
   - Set **Config Path** (under "Deploy" / "Source Repo") to `railway.worker.json`.

This service uses `railway.worker.json`, which runs `pnpm worker` instead of the web server.

## 4. Configure environment variables

In **both** the web and worker service, set:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | Output of `openssl rand -base64 32` |
| `CREDENTIAL_ENCRYPTION_KEY` | Output of `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` (or the Railway-provided URL) |
| `AUTH_TRUST_HOST` | `true` |

`DATABASE_URL` and `REDIS_URL` are auto-injected by the Railway plugins — leave them.

Optional fallback API keys (users can override per-account in Settings):
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `REPLICATE_API_TOKEN`, `FAL_API_KEY`, `STABILITY_API_KEY`, `ELEVENLABS_API_KEY`, `HEYGEN_API_KEY`, `DID_API_KEY`, `DEEPGRAM_API_KEY`, `OPENAI_BASE_URL` (for OpenAI-compatible gateways like 9router).

## 5. Deploy

Railway will redeploy automatically. The first build runs `pnpm db:migrate` to apply the Prisma schema. Visit the Railway-provided URL — you should see the sign-in page.

## 6. Bind your custom domain

1. In the **web** service → **Settings → Networking → Custom Domain**.
2. Enter your domain, e.g. `app.example.com`.
3. Railway shows a CNAME target (e.g. `up-yyyy.up.railway.app`). Add it as a CNAME on your DNS provider.
4. After DNS propagates, Railway provisions an HTTPS cert automatically.
5. Update `NEXT_PUBLIC_APP_URL` to the new domain and redeploy.

That's it — open `https://app.example.com`, sign up, paste your provider keys in Settings → API Keys, and start generating.
