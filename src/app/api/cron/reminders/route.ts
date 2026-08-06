import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cronAuth';
import { cacheEnabled, cacheScanKeys, cacheGet, cacheSet, cacheDelete } from '@/lib/serverCache';
import { webPushEnabled, sendPush, PushSub } from '@/lib/webpush';
import type { StoredReminder } from '@/app/api/push/subscribe/route';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Event reminders that survive the app being closed.
//
// They used to be scheduled with `setTimeout` in AppContext. A setTimeout lives
// in the page, so closing the tab or backgrounding the app long enough to be
// evicted destroyed the timer — meaning a reminder set for tomorrow essentially
// never fired. The one case where it *did* work (app still open hours later) is
// the case where you don't need a notification.
//
// Now the client sends each reminder's absolute fire time along with its push
// subscription, and this job delivers them. The client computes `fireAt` because
// it knows the user's real timezone; the server only ever sees a longitude.
//
// Runs every 15 minutes (see vercel.json) so a "1 hour before" reminder is at
// worst 15 minutes late. The digest cron stays daily — different job, different
// cadence; folding reminders into it would make them up to 6 hours late.
// ─────────────────────────────────────────────────────────────────────────────

interface Envelope {
  subscription: PushSub;
  reminders?: StoredReminder[];
  sentReminderIds?: string[];
  ts?: number;
}

// Don't deliver a reminder that's long past — if the job was down, waking someone
// at 3am for a concert that finished yesterday is worse than staying silent.
const MAX_LATENESS_MS = 3 * 60 * 60 * 1000;

function body(r: StoredReminder): string {
  const when = r.minutesBefore >= 1440 ? 'tomorrow' : 'in about an hour';
  return r.venue ? `${r.title} at ${r.venue} — ${when}` : `${r.title} — ${when}`;
}

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!webPushEnabled) {
    return NextResponse.json({ ok: false, sent: 0, note: 'web push disabled (set VAPID keys)' });
  }
  if (!cacheEnabled) {
    return NextResponse.json({ ok: false, sent: 0, note: 'no subscription store (set Redis/Upstash)' });
  }

  const keys = await cacheScanKeys('nova:push:sub:', 5000);
  const now = Date.now();
  const deadline = now + 45_000;
  let sent = 0, removed = 0, skippedStale = 0, scanned = 0;

  for (const key of keys) {
    if (Date.now() > deadline) break;
    const env = await cacheGet<Envelope>(key);
    if (!env?.subscription?.endpoint || !env.reminders?.length) continue;
    scanned++;

    const alreadySent = new Set(env.sentReminderIds ?? []);
    let changed = false;

    for (const r of env.reminders) {
      if (Date.now() > deadline) break;
      // A reminder is identified by post + offset, so "1 day before" and
      // "1 hour before" on the same event are independently deliverable.
      const id = `${r.postId}:${r.minutesBefore}`;
      if (alreadySent.has(id)) continue;
      if (r.fireAt > now) continue;                       // not due yet
      if (now - r.fireAt > MAX_LATENESS_MS) {              // too late to be useful
        alreadySent.add(id); changed = true; skippedStale++; continue;
      }

      const res = await sendPush(env.subscription, {
        title: 'Nova — Upcoming event 🎉',
        body: body(r),
        url: `/e/${r.postId}`,
        tag: `nova-reminder-${r.postId}`,
      });

      if (res.ok) {
        sent++;
        alreadySent.add(id);
        changed = true;
      } else if (res.gone) {
        // Subscription is dead (404/410) — drop the whole envelope and move on.
        await cacheDelete(key);
        removed++;
        changed = false;
        break;
      }
    }

    if (changed) {
      // Keep the sent-list from growing without bound: a reminder that is no
      // longer in the user's list can never fire again, so its marker is dead
      // weight. Retain only markers for reminders we still hold.
      const live = new Set(env.reminders.map(r => `${r.postId}:${r.minutesBefore}`));
      const pruned = [...alreadySent].filter(id => live.has(id));
      const ttl = Math.max(60, Math.floor(((env.ts ?? now) + 60 * 24 * 3600_000 - now) / 1000));
      await cacheSet(key, { ...env, sentReminderIds: pruned }, ttl);
    }
  }

  return NextResponse.json({ ok: true, sent, removed, skippedStale, scanned, total: keys.length });
}
