// ─────────────────────────────────────────────────────────────────────────────
// A post's display headline.
//
// WHAT THIS FIXES — Nova never had a title. `Post` carried no `title` field at
// all, `eventsDb.postToRow` stored `caption.split('\n')[0]`, and every render
// site independently re-derived that same first line. So whatever happened to
// be the opening of the description became the headline. Measured in production
// on 2026-08-06:
//
//   • a feed card headlined  "https://allevents.in/org/feverup-…"
//     (the source had put a URL where the description should be)
//   • trending cards headlined "Registration opens 3 weeks before the…"
//   • AI trip-briefing bullets that were captions sliced mid-word:
//     "Endlich ist es so weit: Alegría öffnet seine Türen. Ein Ort voller Far"
//   • every post in the /api/feed payload returning title: ""
//
// The sources knew the real name the whole time — Ticketmaster `ev.name`,
// Eventbrite `ev.name`, SeatGeek `ev.title`, the crawler `ev.name` — it was
// just never carried onto the Post. `Post.title` now carries it, and this
// module is the ONLY place that decides what to render, so the fallback chain
// can't drift apart across components again (which is exactly how three
// different render sites ended up with three different bugs).
//
// Legacy rows written before this change still hold a caption-derived title, so
// the fallbacks below have to stay tolerant — but they must never emit a URL.
// ─────────────────────────────────────────────────────────────────────────────

/** A string that is really a link, not a name. Never acceptable as a headline. */
export function isUrlish(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^(https?:\/\/|www\.)/i.test(s)) return true;
  // "allevents.in/org/feverup-vienna" — no scheme, but still a link.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(s)) return true;
  return false;
}

/**
 * Normalise a candidate headline, or return '' when it isn't usable.
 *
 * Rejects URLs, blank strings, and one-or-two character noise. Collapses the
 * whitespace that crawled JSON-LD is full of.
 */
export function cleanTitle(raw: string | null | undefined, max = 90): string {
  if (!raw) return '';
  // Strip the emoji-prefixed metadata lines the captions are built from, in
  // case a caption line reaches us: "📅 Friday…", "📍 Venue", "🎟️ …", "🔗 …".
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3) return '';
  if (isUrlish(s)) return '';
  if (/^[📅📍🎟🔗🗺✨🔥]/u.test(s)) return '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** The first caption line, when it is usable as a headline. */
export function titleFromCaption(caption: string | null | undefined, max = 90): string {
  if (!caption) return '';
  const first = String(caption).split('\n').find((l) => l.trim().length > 0) ?? '';
  return cleanTitle(first, max);
}

type TitleablePost = {
  title?: string | null;
  caption?: string | null;
  eventVenue?: string | null;
  location?: { name?: string | null } | null;
  user?: { name?: string | null } | null;
};

/**
 * The headline to show for a post.
 *
 * Order matters: the source's real event name wins, then a caption line that
 * actually reads like a title, then the venue, then the place. `fallback` is
 * the last resort so a card is never headline-less — see `hasCoreContent` in
 * src/lib/postQuality.ts, which drops posts that get that far.
 */
export function postTitle(post: TitleablePost, fallback = 'Event', max = 90): string {
  return (
    cleanTitle(post.title, max) ||
    titleFromCaption(post.caption, max) ||
    cleanTitle(post.eventVenue, max) ||
    cleanTitle(post.location?.name, max) ||
    cleanTitle(post.user?.name, max) ||
    fallback
  );
}
