import * as Sentry from '@sentry/nextjs';

// Server-side error monitoring. Initialises Sentry ONLY when a DSN is configured,
// so the app runs identically (no-op) until you add SENTRY_DSN in Vercel.
// No build-time webpack/Turbopack plugin is used (source-map upload is optional),
// which keeps the production build stable.
export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV || 'development',
    });
  }
}

// Captures errors thrown in nested React Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
