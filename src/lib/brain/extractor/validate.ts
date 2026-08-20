// ─────────────────────────────────────────────────────────────────────────────
// The reward signal.
//
// A learner is only as good as the thing that tells it when it got it right.
// Everything the engine learns is validated here, so this file is the reason a
// newly-invented skill can be trusted: a candidate reader is only kept if the
// records it produces pass these checks on real rows of the real page.
//
// The bar is deliberately about SUBSTANCE, not completeness — plenty of honest
// listings have no price and no photo. What we refuse is the stuff that means
// "you matched navigation chrome, not content": empty names, menu labels,
// cookie banners, dates that aren't dates, coordinates in the ocean of NaN.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedRecord } from './types';

/** Boilerplate that shows up when a selector accidentally matched page chrome. */
const CHROME = new Set([
  'home', 'menu', 'search', 'login', 'log in', 'sign in', 'sign up', 'register',
  'about', 'about us', 'contact', 'contact us', 'privacy', 'privacy policy',
  'terms', 'terms of service', 'imprint', 'impressum', 'cookies', 'cookie policy',
  'newsletter', 'subscribe', 'settings', 'help', 'faq', 'support', 'blog',
  'next', 'previous', 'back', 'more', 'read more', 'show more', 'load more',
  'all', 'other', 'others', 'none', 'undefined', 'null', 'test', 'example',
  'accept', 'accept all', 'reject', 'close', 'skip', 'share', 'follow',
]);

/** Looks like a real ISO-ish date we can act on. */
export function looksLikeDate(v: unknown): boolean {
  if (typeof v === 'number') {
    // Epoch seconds or millis, within a sane window (2000 → 2100).
    const ms = v > 1e11 ? v : v * 1000;
    return ms > 946_684_800_000 && ms < 4_102_444_800_000;
  }
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length < 8 || s.length > 40) return false;
  // ISO 8601 (the overwhelming majority) or common d/m/Y and Y/m/d forms.
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) return true;
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(s)) return true;
  if (/^\d{4}[./]\d{1,2}[./]\d{1,2}/.test(s)) return true;
  return false;
}

/** An absolute http(s) URL. Protocol-relative counts — we can fix those. */
export function looksLikeUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return /^(https?:)?\/\/[^\s"'<>]+\.[a-z]{2,}/i.test(s) && s.length < 2000;
}

/** An image URL specifically — extension, or a known image CDN path shape. */
export function looksLikeImage(v: unknown): boolean {
  if (!looksLikeUrl(v)) return false;
  const s = (v as string).toLowerCase();
  if (/\.(jpe?g|png|webp|avif|gif)(\?|#|$)/.test(s)) return true;
  return /\/(image|images|img|photo|photos|media|thumb|thumbs|cdn)\//.test(s);
}

/** Something a human would read as a price ("€12", "from 25 USD", "Free"). */
export function looksLikePrice(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < 100_000;
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > 40) return false;
  if (/^(free|gratis|kostenlos|gratuit|gratuito|無料)$/i.test(s)) return true;
  return /[€$£¥₹]|\b(eur|usd|gbp|chf|jpy|inr|aud|cad)\b/i.test(s) && /\d/.test(s);
}

export function looksLikeLat(v: unknown): boolean {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 90 && n !== 0;
}

export function looksLikeLng(v: unknown): boolean {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 180 && n !== 0;
}

/** Free prose: long enough to be a sentence, not a URL or a single token. */
export function looksLikeProse(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length >= 40 && s.length <= 5000 && /\s/.test(s) && !looksLikeUrl(s);
}

/** A plausible display name for a thing: a few words, not chrome, not a URL. */
export function looksLikeName(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length < 3 || s.length > 200) return false;
  if (looksLikeUrl(s)) return false;
  if (CHROME.has(s.toLowerCase())) return false;
  // Must contain at least one letter in ANY script — a name of pure digits or
  // punctuation is an id that leaked into the wrong field.
  if (!/\p{L}/u.test(s)) return false;
  // A raw slug ("summer-jazz-festival-2026") is a key, not a published name.
  if (/^[a-z0-9]+(-[a-z0-9]+){2,}$/.test(s)) return false;
  return true;
}

/**
 * Is this record worth keeping?
 *
 * A name alone is not enough — that matches every link on the page. We require
 * the name PLUS at least one hard fact that makes it actionable: when it is,
 * where it is, what it costs, or where to read/book it.
 */
export function isUsableRecord(r: Partial<ExtractedRecord>): r is ExtractedRecord {
  if (!r || !looksLikeName(r.name)) return false;
  const hasWhen  = looksLikeDate(r.startDate);
  const hasWhere = Boolean(r.venue || r.street || r.locality) || (looksLikeLat(r.lat) && looksLikeLng(r.lng));
  const hasLink  = looksLikeUrl(r.url) || looksLikeUrl(r.ticketUrl);
  const hasWhat  = looksLikeProse(r.description) || looksLikeImage(r.image);
  return hasWhen || hasWhere || hasLink || hasWhat;
}

/**
 * How much a usable record is actually worth, 0..1.
 *
 * Used to rank one candidate reader against another: two readers can both
 * "work" while one of them returns names and links and the other returns names,
 * dates, venues, prices and photos. Without this the learner would happily
 * settle for the thinnest reader that passed.
 */
export function recordRichness(r: ExtractedRecord): number {
  let score = 0;
  if (looksLikeName(r.name)) score += 2;
  if (looksLikeDate(r.startDate)) score += 2;
  if (r.venue || r.street || r.locality) score += 1.5;
  if (looksLikeLat(r.lat) && looksLikeLng(r.lng)) score += 1.5;
  if (looksLikeUrl(r.url)) score += 1;
  if (looksLikeUrl(r.ticketUrl)) score += 1.5;
  if (looksLikeImage(r.image)) score += 1;
  if (looksLikePrice(r.price)) score += 1;
  if (looksLikeProse(r.description)) score += 1;
  if (r.duration || r.openingHours) score += 0.5;
  return Math.min(1, score / 10);
}

/** Mean richness of a batch — the quality half of a candidate's score. */
export function batchQuality(records: ExtractedRecord[]): number {
  if (records.length === 0) return 0;
  return records.reduce((s, r) => s + recordRichness(r), 0) / records.length;
}
