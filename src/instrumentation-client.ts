import * as Sentry from '@sentry/nextjs';

// Client-side error monitoring. Loaded automatically by Next.js. Initialises only
// when a public DSN is set, so it no-ops until you configure NEXT_PUBLIC_SENTRY_DSN.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Session Replay stays OFF. If it were ever enabled it would record the
    // signup form; Sentry masks inputs by default, but the safe state for a
    // form that takes passwords is "not recorded at all".
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
    // Explicit rather than relying on the SDK default — no IPs, no request
    // bodies, nothing that identifies a person, attached to client errors.
    sendDefaultPii: false,
  });
}

// Lets Sentry track client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
