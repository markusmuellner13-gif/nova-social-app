# Nova — location-first discovery app

Nova is a mobile-first, location-based discovery app. It shows **only real local
content** (events, concerts, sports, restaurants, hotels, rentals, sightseeing)
for the user's current city, blended from multiple live sources and an own events
database.

- **Stack:** Next.js 16 (App Router), React 19, Tailwind v4, Framer Motion,
  Supabase (auth + Postgres/PostGIS), Upstash Redis, Stripe (REST), Capacitor (iOS/Android wrapper).
- **Live:** https://nova-phi-liart.vercel.app

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values (see below)
npm run dev                  # http://localhost:3000
npm run build                # production build / type-check
```

Without any keys the app still runs: OpenStreetMap + Wikipedia paths work, and
every gated feature (AI, Ticketmaster, Redis, Stripe, Supabase) no-ops cleanly.

## Architecture

- **Feed engine** — `src/lib/sources/*` (osm, ticketmaster, seatgeek, eventbrite,
  wikipedia, claudeAI, geocode, shared). The client (`useAIFeed`) calls
  **`/api/feed`**, which merges all relevant sources, dedupes, ranks and caches.
- **Serving order** — Redis cache → own events DB (Supabase + PostGIS) → live
  compute. `fresh=1` bypasses cache + DB.
- **Ingestion** — `/api/cron/ingest` (daily) populates the events DB;
  `/api/cron/warm` pre-warms popular Italian cities.
- **City search** — `/api/geocode` proxies Nominatim server-side (cached,
  rate-limited) so the autocomplete scales without hitting OSM from every browser.
- **Monetization** — `/business` self-serve paid posts → Stripe Checkout →
  `/api/business/activate` + `/api/business/webhook` publish a sponsored post.

## Security

See [SECURITY.md](./SECURITY.md). In short: per-IP tiered rate limiting on every
API route (middleware), strict security headers + CSP, host-allowlisted image
proxy, RLS on all tables, signature-verified Stripe webhooks, header-only admin
auth, and GDPR data export / account deletion.

## Environment variables

All configured in Vercel (Production + Preview). See `.env.example` for the full
list and notes. Key ones:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | AI enrichment + web search |
| `TICKETMASTER_API_KEY` | Events & sport |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Auth + DB (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | DB ingestion + account deletion (server only) |
| `KV_REST_API_URL` / `_TOKEN` (or `UPSTASH_*`) | Redis cache + rate limiting |
| `CRON_SECRET` / `ADMIN_SECRET` | Protect cron / admin endpoints |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payments |

## Deploy

Push to `master` auto-deploys on Vercel, or run `vercel --prod --yes` from this
folder. Crons in `vercel.json` must be **daily** on the Hobby plan — upgrade to
Pro for higher concurrency, longer functions, and finer cron schedules before a
large launch.

## Release checklist (before scaling)

- [ ] Upgrade Vercel from Hobby → Pro/Enterprise (concurrency, function limits, SLA)
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `CRON_SECRET` in Vercel
- [ ] Wire an error monitor (Sentry env vars are scaffolded in `.env.example`)
- [ ] Finalise legal entity details in `/privacy`, `/terms`, `/cookie` (lawyer review)
- [ ] Add automated tests + CI before shipping hotfixes at scale
