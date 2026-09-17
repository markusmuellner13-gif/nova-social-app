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
| `SEATGEEK_CLIENT_ID` | Extra event inventory where Ticketmaster is thin (free) |
| `GOOGLE_PLACES_LEGACY` | `off` retires the legacy Places fallback — see below |
| `INGEST_HOT_PER_COLD` | Demand-ranking ratio for the ingest sweep (default 3, `0` disables) |

Names must match **exactly**. Everything here is gated: a missing key disables
that one feature and the app keeps working, which also means a **misspelt** key
looks identical to an unset one and fails silently. If a feature seems to do
nothing, check the spelling in Vercel first. (Real example: the Supabase
dashboard labels the key `service_role`, but this app reads
`SUPABASE_SERVICE_ROLE_KEY` — pasting it under the dashboard's label silently
disables all DB writes, and ingestion goes quiet with no error anywhere.)

### Re-enabling the legacy Google Places fallback

`GOOGLE_PLACES_LEGACY=off` is set in Vercel, so the app doesn't call it.

**Background.** Photos come from a cascade (OSM tags → Wikidata/Commons →
Google Places → the venue's own og:image). Google Places has two APIs: the
modern one (`places.googleapis.com`, which this app uses and which works), and
the **legacy** one (`maps.googleapis.com/maps/api/place/…`), tried only as a
fallback when the modern API finds no photo.

From 2026-08-05 the legacy path returned `REQUEST_DENIED — This API key is not
authorized to use this service` on every call: Google locked legacy Places for
projects created after March 2025. Since it can only ever be a config fault, the
code now breaks the circuit on the first denial (6h) and `off` skips it outright.

**To turn it back on** — only worth doing if venue photo coverage looks visibly
thin, and note Google is actively retiring these endpoints:

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   → click the key used by `GOOGLE_PLACES_API_KEY`
2. **API restrictions** → add **"Places API"** — the legacy one, *not*
   "Places API (New)", which is already enabled
3. Save, wait ~5 minutes for propagation
4. Remove `GOOGLE_PLACES_LEGACY` from Vercel (or set it to anything but `off`)
   and redeploy

It is a **paid** path (~$0.017 Find Place + ~$0.007 Photo per lookup), bounded
by `PLACES_DAILY_BUDGET` (default 150/day). Watch for `[breaker/places-legacy]`
in the logs to confirm whether it started working or was denied again.

## Deploy

Push to `master` auto-deploys on Vercel, or run `vercel --prod --yes` from this
folder.

**This project is on Vercel Pro**, so the old Hobby restriction — one cron run
per day — no longer applies, and `vercel.json` can schedule crons as finely as
needed. The GitHub Action in `.github/workflows/ingest.yml` exists only as a
workaround for that Hobby limit and is now the *slower* of the two paths:
GitHub throttles its `*/30` schedule down to roughly one run every 3.4 hours.
Moving the ingest sweep onto a Vercel cron is the single cheapest freshness win
available.

## Release checklist (before scaling)

- [ ] Upgrade Vercel from Hobby → Pro/Enterprise (concurrency, function limits, SLA)
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `CRON_SECRET` in Vercel
- [ ] Wire an error monitor (Sentry env vars are scaffolded in `.env.example`)
- [ ] Finalise legal entity details in `/privacy`, `/terms`, `/cookie` (lawyer review)
- [ ] Add automated tests + CI before shipping hotfixes at scale
