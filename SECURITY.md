# Security overview

This document summarises the security controls in Nova and what still requires
operator action before a large public launch.

## Application-layer controls (in code)

- **Tiered per-IP rate limiting on every `/api/*` route** (`middleware.ts`).
  Three budgets per minute per IP: `ai` (20) for `/api/chat`, `/api/feed`,
  `/api/events`; `write` (15) for business / account / push / admin; `read` (60)
  for geocode / track / image-proxy / sponsored. Redis-backed (Upstash) when
  configured so limits persist across serverless instances; in-memory fallback
  otherwise. Webhooks and crons are excluded (they use signature / secret auth).
- **AI cost-abuse protection** — `/api/chat` caps message length (1000 chars,
  hard-rejects > 4000), sanitises location input, and times out upstream calls.
- **Security headers + CSP** (`next.config.ts`) — HSTS (preload), `X-Frame-Options:
  SAMEORIGIN`, `X-Content-Type-Options: nosniff`, strict `Referrer-Policy`,
  locked-down `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`,
  and a Content-Security-Policy restricting scripts/styles/connect to known hosts.
- **Image proxy** (`/api/image-proxy`) — host allowlist, HTTPS-only, content-type
  check, and a 10 MB response cap to protect serverless memory.
- **Admin endpoint** (`/api/admin/*`) — header-only Bearer auth with constant-time
  comparison, using a dedicated `ADMIN_SECRET` (separate from `CRON_SECRET`).
- **Payments** — Stripe webhook signature verified with HMAC-SHA256 +
  `timingSafeEqual`; activation re-confirms payment with Stripe server-side.
- **Database** — Supabase Row-Level Security on every table; the service-role key
  is server-only and never shipped to the client.
- **Privacy by design** — cookie/analytics consent is opt-in; analytics and any
  ads load only after consent.

## GDPR / Italian Garante

- Consent banner (`components/CookieConsent.tsx`) — opt-in, withdrawable.
- Right of access / portability — Profile → Settings → **Download my data** (JSON).
- Right to erasure — Profile → Settings → **Delete account & data**
  (`/api/account/delete` deletes the auth user; cascades remove all related rows).
- Age gate at onboarding (min age 14, per Italian implementation of Art. 8 GDPR).
- Privacy / Cookie / Terms pages name the controller, legal bases, processors,
  retention, rights, and the Garante complaint route.

## Operator action required before scaling

These cannot be done in code alone:

1. **Upgrade Vercel** Hobby → Pro/Enterprise (concurrency, function duration, SLA,
   finer cron schedules). A real WAF / DDoS layer (Vercel Firewall or Cloudflare)
   should sit in front for "millions of users".
2. **Set production secrets** in Vercel: `ADMIN_SECRET`, `CRON_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, Stripe live keys + webhook secret.
3. **Error monitoring** — add a Sentry DSN (scaffolded in `.env.example`).
4. **Legal review** — have counsel finalise the controller identity, DPO, and the
   privacy/terms/cookie text.
5. **Bot protection** — add CAPTCHA / Vercel Firewall rules on signup + checkout.
6. **Automated tests + CI** — add coverage for auth, checkout and `/api/feed`.

## Reporting a vulnerability

Email **security@nova-app.com** (or privacy@nova-app.com). Please do not open a
public issue for security reports.
