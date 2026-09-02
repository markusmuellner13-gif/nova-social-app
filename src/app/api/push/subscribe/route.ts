import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheSet, cacheGet } from '@/lib/serverCache';

// A reminder the user set on an event, in the form the cron needs: an absolute
// moment to fire at. The client does the date arithmetic (it knows the user's
// real timezone; the server only ever sees a longitude) and sends the result.
export interface StoredReminder {
  postId: string;
  title: string;
  venue?: string | null;
  fireAt: number;      // epoch ms
  minutesBefore: number;
}

function sanitizeReminders(raw: unknown): StoredReminder[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredReminder[] = [];
  for (const r of raw.slice(0, 100)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.postId !== 'string' || typeof o.title !== 'string') continue;
    const fireAt = Number(o.fireAt);
    if (!Number.isFinite(fireAt)) continue;
    out.push({
      postId: o.postId.slice(0, 128),
      title: o.title.slice(0, 120),
      venue: typeof o.venue === 'string' ? o.venue.slice(0, 120) : null,
      fireAt,
      minutesBefore: Number(o.minutesBefore) || 60,
    });
  }
  return out;
}

// A device registration from the bundled native app. Phones can't hold a
// PushSubscription (no service worker in a Capacitor WebView), so they send the
// APNs/FCM token the OS issued instead. Everything downstream — city, coords,
// interests, locale, reminders, the 10h cooldown — is identical either way.
interface NativeRegistration { platform: 'ios' | 'android'; token: string }

function sanitizeNative(raw: unknown): NativeRegistration | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const platform = o.platform;
  if (platform !== 'ios' && platform !== 'android') return null;
  // APNs tokens are 64 hex chars; FCM tokens are longer and base64-ish. Bound the
  // length rather than pattern-match, so a future token format still registers.
  if (typeof o.token !== 'string' || o.token.length < 32 || o.token.length > 512) return null;
  return { platform, token: o.token };
}

// Stores a push destination (+ the user's city/coords) so the daily digest cron
// (/api/cron/push) can send "events near you". Persists in Redis when
// configured; otherwise accepts and no-ops (in-session reminders still work).
//
// Accepts three shapes: the native envelope { native: { platform, token }, … },
// the web envelope { subscription, city, lat, lng }, and the legacy bare
// PushSubscription — the last two unchanged, for backwards compatibility.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      native?: unknown;
      subscription?: { endpoint?: string };
      endpoint?: string;
      city?: string; lat?: number; lng?: number; categories?: unknown; userId?: unknown;
      locale?: string;
      reminders?: unknown;
    };
    const native = sanitizeNative(body.native);
    const sub = native ? null : (body.subscription ?? (body.endpoint ? body : null));
    if (!native && !sub?.endpoint) {
      return NextResponse.json({ ok: false, error: 'invalid subscription' }, { status: 400 });
    }
    if (cacheEnabled) {
      // Key by a hash of the destination so re-subscribing overwrites cleanly.
      // A device token is namespaced by platform so the two token spaces can
      // never collide on one key.
      const identity = native ? `native:${native.platform}:${native.token}` : sub!.endpoint!;
      let h = 2166136261;
      for (let i = 0; i < identity.length; i++) { h ^= identity.charCodeAt(i); h = Math.imul(h, 16777619); }
      // Keep only a few short, sane category strings — these personalise the
      // push copy ("for the music lovers near you").
      const categories = Array.isArray(body.categories)
        ? body.categories.filter((c): c is string => typeof c === 'string').slice(0, 5).map(c => c.slice(0, 24))
        : null;
      const key = `nova:push:sub:${(h >>> 0).toString(36)}`;

      // Merge onto what's already stored instead of overwriting it. This route
      // is called again on every city change, and a wholesale overwrite wiped
      // `lastPush` (the 10h anti-spam cooldown) and `sentReminderIds` — so
      // simply moving city could re-trigger a digest or replay a reminder the
      // user had already been sent.
      const prev = (await cacheGet<Record<string, unknown>>(key)) ?? {};

      const envelope = {
        ...prev,
        // Exactly one destination is ever set, and re-registering clears the
        // other — a device that somehow wrote both would get double-pushed.
        subscription: native ? null : sub,
        native,
        city: typeof body.city === 'string' ? body.city.slice(0, 80) : null,
        lat: Number.isFinite(body.lat) ? body.lat : null,
        lng: Number.isFinite(body.lng) ? body.lng : null,
        categories,
        // The language the user picked in Profile → Settings. Notifications are
        // built ENTIRELY from it (src/lib/pushCopy.ts) — before this, an English
        // template wrapped a German or Japanese event title and shipped two
        // languages in one notification. Only replaced when the client sends
        // one, so a location re-sync can't silently reset someone to English.
        ...(typeof body.locale === 'string' ? { locale: body.locale.slice(0, 10) } : {}),
        // The signed-in user's id, so the digest can surface "a friend you follow
        // is going to an event near you". Null for anonymous subscribers.
        userId: typeof body.userId === 'string' ? body.userId.slice(0, 64) : null,
        // Only replace the reminder list when the client actually sent one, so a
        // plain location re-sync doesn't clear the user's reminders.
        ...(body.reminders !== undefined ? { reminders: sanitizeReminders(body.reminders) } : {}),
        ts: Date.now(),
      };
      await cacheSet(key, envelope, 60 * 60 * 24 * 60); // 60 days
    }
    return NextResponse.json({ ok: true, stored: cacheEnabled });
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
}
