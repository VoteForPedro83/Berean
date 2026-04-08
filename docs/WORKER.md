# Berean — Cloudflare Worker Reference

File: `worker/cloudflare-worker.js`

## Endpoints

```
GET  /api/study/:id              → Fetch study pack from KV (public, no auth)
POST /api/study/:id              → Create study (requires Bearer token)
PATCH /api/study/:id             → Update study (requires Bearer token)
DELETE /api/study/:id            → Delete + purge analytics (requires Bearer token)
POST /api/analytics/view/:id     → Increment view counter (anonymous)
POST /api/analytics/complete/:id → Increment completion counter (opt-in)
GET  /s/:id                      → SPA shell + HTMLRewriter Open Graph injection
GET  /api/bible/*                → API.Bible proxy + KV cache (30-day TTL)
POST /api/openai/*               → OpenAI CORS proxy (adds Authorization header)
```

## Authentication
Use `crypto.subtle.timingSafeEqual()` to compare Bearer token against `PREACHER_SECRET` KV env var.
This prevents timing attacks.

## API.Bible Caching
- Cache every verse in KV with 30-day TTL
- Cache key: `bible:{translationId}:{osisId}`
- Rate limit per IP: 100 requests/day (stored as KV counter)
- Max 500 consecutive verses per API.Bible ToS
- Never cache in IndexedDB — use KV only

## KV Bindings Required
- `STUDY_KV` — study session storage + analytics counters
- `API_BIBLE_KEY` — API.Bible API key (secret)
- `PREACHER_SECRET` — Bearer token for authenticated endpoints

## Local Development
```bash
wrangler dev worker/cloudflare-worker.js
```
Miniflare simulates KV and Workers locally.
