import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY verification route — confirms Sentry is receiving events.
//
// Protected by ADMIN_SECRET (header `Authorization: Bearer <secret>` OR `?secret=`
// for browser convenience) so it can't be used to burn your Sentry quota.
// Sends one test error and reports whether a DSN is configured.
//
// Safe to delete once you've confirmed the event appears in your Sentry dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

function authed(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    || new URL(request.url).searchParams.get('secret') || '';
  return provided === secret;
}

export async function GET(request: NextRequest) {
  if (!authed(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return NextResponse.json(
      { ok: false, configured: false, message: 'No SENTRY_DSN set — Sentry is not active.' },
      { status: 501 },
    );
  }

  const eventId = Sentry.captureException(
    new Error(`Nova Sentry test event — ${new Date().toISOString()}`),
  );
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    configured: true,
    eventId,
    message: 'Test error sent. Check your Sentry dashboard → Issues for "Nova Sentry test event".',
  });
}
