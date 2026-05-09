# AllWasGood

> **Self-hosted, provider-agnostic AI marketing content suite — a Pippit.ai-style platform you fully control.**

Bring your own LLM, image, video, avatar, and TTS providers. Deploy to Railway or any VPS. Use your own domain.

---

## What it does

A complete AI marketing content platform inspired by [Pippit.ai](https://www.pippit.ai/), but **self-hosted** and **provider-agnostic**:

- **Smart Creation** — turn a product link into marketing copy + images + videos
- **AI Image Agent** — product posters, social posts, multiple styles, batch generation
- **AI Video Agent** — text/link/image → marketing videos, multiple aspect ratios & languages
- **Digital Avatars** — talking-head videos with realistic / 3D / anime style avatars
- **Auto-Publishing** — schedule and post directly to TikTok, Instagram, YouTube, Facebook, Twitter
- **Brand Kit** — keep colors, fonts, logos, and voice consistent across every generation
- **AI Editor** — timeline-based editor (Remotion) for fine-tuning generated content

## Architecture

- **Web** — Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui
- **API** — Next.js Route Handlers + Server Actions
- **Database** — PostgreSQL via Prisma
- **Queue** — BullMQ on Redis (separate worker process for long-running AI jobs)
- **Auth** — Auth.js v5 (NextAuth) with email/password + OAuth (Google, GitHub)
- **Storage** — S3-compatible (AWS S3, Cloudflare R2, Backblaze, MinIO) or local
- **i18n** — next-intl (Indonesian + English out of the box)

### Provider abstraction

All AI capabilities go through a unified provider interface in `src/providers/`. Every provider implements one or more capability interfaces (`llm`, `image`, `video`, `avatar`, `tts`, `stt`). API keys are stored **encrypted at rest** (AES-256-GCM) and resolved per-request from the user's `Credential` rows in the DB.

Out of the box we support:

| Provider | LLM | Image | Video | Avatar | TTS | STT |
|---|---|---|---|---|---|---|
| OpenAI | ✓ | ✓ | | | ✓ | ✓ |
| Anthropic Claude | ✓ | | | | | |
| Google Gemini | ✓ | | | | | |
| Groq (OpenAI-compatible) | ✓ | | | | | |
| Ollama / LM Studio / vLLM (self-hosted) | ✓ | | | | | |
| Xiaomi MiMo | ✓ | | | | | |
| OpenAI-compatible (custom gateway, e.g. 9router / OpenRouter) | ✓ | | | | | |
| Replicate | | ✓ | ✓ | | ✓ | |
| fal.ai | | ✓ | ✓ | | | |
| Stability AI | | ✓ | | | | |
| ElevenLabs | | | | | ✓ | |
| HeyGen | | | | ✓ | | |
| D-ID | | | | ✓ | | |
| Deepgram | | | | | | ✓ |

Adding a new provider is one file: implement the capability interface, register it in `src/providers/registry.ts`. Done.

## Quickstart (local)

```bash
# 1. Install deps
pnpm install   # or npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_URL, AUTH_SECRET, CREDENTIAL_ENCRYPTION_KEY
openssl rand -base64 32   # use this for AUTH_SECRET and CREDENTIAL_ENCRYPTION_KEY

# 3. Start Postgres + Redis (Docker)
docker compose up -d

# 4. Migrate DB
pnpm db:push

# 5. Run dev server + worker
pnpm dev           # in one terminal
pnpm worker        # in another terminal

# 6. Open http://localhost:3000
# Sign up, go to Settings → API Keys, paste your provider key(s) and start generating.
```

## Deploy to Railway

1. Click **New Project → Deploy from GitHub** and pick this repo.
2. Add **Postgres** plugin and **Redis** plugin to the project — `DATABASE_URL` and `REDIS_URL` are auto-injected.
3. Set required env vars: `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`.
4. Railway will read [`railway.json`](./railway.json) and run two services: **web** (Next.js) and **worker** (BullMQ).
5. Bind your custom domain in the Railway service settings → CNAME to the provided Railway domain.

See [`docs/DEPLOY_RAILWAY.md`](./docs/DEPLOY_RAILWAY.md) for the full step-by-step.

## Deploy to a VPS (Docker Compose)

```bash
cp .env.example .env
# fill in env
docker compose -f docker-compose.prod.yml up -d --build
```

Then point your domain at the VPS via Caddy/Nginx + Let's Encrypt for HTTPS. See [`docs/DEPLOY_VPS.md`](./docs/DEPLOY_VPS.md).

## Roadmap

This repo lands in stages, each as its own PR:

- [x] **PR 1 — Foundation** — auth, DB, queue, provider abstraction layer, settings UI, deploy config
- [x] **PR 2 — Smart Creation** — paste a product URL, get scraped product data + LLM-written marketing copy variants + (optional) AI-generated images
- [ ] **PR 3 — AI Avatar Video** — text → talking head with HeyGen/D-ID
- [ ] **PR 4 — Link-to-Video** — product URL → storyboard → TTS + visuals → rendered video (FFmpeg worker)
- [ ] **PR 5 — Auto-Posting** — TikTok / Instagram / YouTube OAuth + scheduled publish
- [ ] **PR 6 — AI Editor** — Remotion-based timeline editor with AI suggestions

## License

MIT — see [LICENSE](./LICENSE).
