# Alerting

**Status: errors are already being captured. Nothing pages you yet.**

That distinction is the whole of the remaining work. Sentry is wired, the DSN is
set, and the CSP allows Sentry's ingest hosts — so exceptions are arriving in the
dashboard right now. But Sentry sends no notifications by default. Until the
rules below exist, a failure at 3am is recorded and nobody is told.

This is not hypothetical: Google Places was returning zero photos for weeks and
nothing surfaced it. That is precisely the failure class these rules catch.

## What is already done

| Piece | Where | State |
|---|---|---|
| Server capture | `src/instrumentation.ts` | inits when `SENTRY_DSN` **or** `NEXT_PUBLIC_SENTRY_DSN` is set |
| Route-handler errors | `onRequestError` in `src/instrumentation.ts` | exported |
| Client capture | `src/instrumentation-client.ts` | inits on `NEXT_PUBLIC_SENTRY_DSN` |
| Navigation tracking | `onRouterTransitionStart` | exported |
| DSN | Vercel env | `NEXT_PUBLIC_SENTRY_DSN` set |
| CSP | `middleware.ts` | `connect-src` allows `*.sentry.io`, `*.ingest.sentry.io`, `*.ingest.de.sentry.io` |

Only `NEXT_PUBLIC_SENTRY_DSN` is set — there is no plain `SENTRY_DSN`. That is
fine: the server falls back to the public DSN, and a Sentry DSN is designed to be
public (it can only write events, not read them).

## Step 1 — confirm events are arriving

Sentry → your project → **Issues**. If it is empty, generate one:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://nova-phi-liart.vercel.app/api/feed?category=events&lat=notanumber&lng=x"
```

If nothing appears within a minute, the DSN value is wrong — replace it in Vercel
and redeploy (`NEXT_PUBLIC_*` is inlined at build time, so a redeploy is required
for a change to take effect).

## Step 2 — the four rules worth having

Sentry → **Alerts** → **Create Alert**. Set the owner to yourself and pick email
(and/or Slack) as the action. Suggested settings, in priority order:

### 1. Server 5xx spike — "the app is down"
- Type: **Issue alert**
- Conditions: an issue is seen **more than 20 times in 1 hour**
- Filter: `level:error` and `environment:production`
- Action: notify immediately

### 2. Any brand-new issue in production — "something broke that never broke before"
- Type: **Issue alert**
- Condition: **a new issue is created**
- Filter: `environment:production`
- Action: notify (this is the highest-signal rule for a small app)

### 3. A data source going quiet — "the Places-died-for-weeks case"
The code logs failures with recognisable prefixes (`[places/*]`, `[feed/osm]`,
`[feed/tm]`, `[feed/novaAI]`). Create an issue alert filtered on
`message:"[places" OR message:"[feed/osm"` firing on **more than 10 events in
1 hour**.

A silent source is harder: it fails by returning *nothing*, not by throwing. The
honest catch for that is a cron heartbeat (step 3), not an error rule.

### 4. Cron failure — "content stopped refreshing"
`/api/cron/ingest`, `/api/cron/warm`, `/api/cron/push` and
`/api/cron/ingest-towns` run on a schedule (see `vercel.json`). In **Vercel →
Project → Settings → Notifications**, enable failure notifications for cron jobs.
Vercel does this natively and it needs no code.

## Step 3 — the gap Sentry cannot fill

Sentry alerts on *errors*. It cannot tell you that a cron **did not run**, or
that the feed is technically 200-OK but returning an empty page. For that you
need an uptime/heartbeat check:

- **Vercel → Settings → Notifications** covers deployment and cron failure.
- A free external monitor (UptimeRobot, Better Stack, Cronitor) hitting
  `https://nova-phi-liart.vercel.app/api/feed?category=events&lat=48.21&lng=16.37&count=1`
  every 5 minutes catches "responds but is broken" in a way error tracking never
  will. Alert if the response is non-200 **or** the body does not contain
  `"posts"`.

## Cost

Sentry's free tier is 5k errors/month, which is ample here. Alert rules cost
nothing. Uptime monitors are free at this volume.

## Deliberately not done

No PagerDuty/on-call rotation. For a single-maintainer app, email plus a phone
notification from Slack is the right amount of machinery; a rotation would be
ceremony without a second person to rotate to.
