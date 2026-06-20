import * as Sentry from '@sentry/nextjs';

// Client-side error monitoring. Loaded automatically by Next.js. Initialises only
// when a public DSN is set, so it no-ops until you configure NEXT_PUBLIC_SENTRY_DSN.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  });
}

// Lets Sentry track client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
