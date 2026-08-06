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
      // Never attach request bodies, headers, cookies or IPs to an event.
      // This is the SDK default, but it is set explicitly because it is now
      // load-bearing: /api/auth/[...path] proxies Supabase's credential
      // endpoints, so a plaintext password is briefly present in a request body
      // on this server. If an unhandled error there ever attached request data,
      // that password would be shipped to Sentry. A silent default is too thin a
      // thread to hang that on.
      sendDefaultPii: false,
      beforeSend(event) {
        // Belt and braces: strip any request payload that reached the event by
        // another route (integration change, manual captureException with
        // context, a future SDK default flip).
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.apikey;
            delete event.request.headers.cookie;
          }
        }
        return event;
      },
    });
  }
}

// Captures errors thrown in nested React Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
