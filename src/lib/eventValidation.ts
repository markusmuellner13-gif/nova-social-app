// ─────────────────────────────────────────────────────────────────────────────
// Event validation — the quality gate before anything reaches the database.
//
// Every event we ingest (from APIs, web crawls, anywhere) passes through here so
// the DB never fills with corrupt, fake, spammy, expired, or mislocated rows.
// It's the "check the data is right" layer: deterministic, fast, no credits.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApiPost } from '@/lib/sources/shared';
import { haversineKm, todayStr } from '@/lib/sources/shared';

// Obvious spam / scam / fake-listing signals.
const SPAM_RE = /\b(viagra|cialis|casino|porn|xxx|escort|loan|bitcoin doubler|crypto giveaway|free money|make money fast|work from home|click here now|forex signals|adult webcam)\b/i;
// Placeholder / junk titles that some scrapers emit.
const JUNK_TITLE_RE = /^(untitled|test event|lorem ipsum|null|undefined|n\/a|tbd|tba|event \d+|page not found|404|access denied)$/i;
// A title that is mostly symbols / no letters is corrupt.
const HAS_LETTERS_RE = /\p{L}{3,}/u;

// How far ahead an event may be scheduled before we treat it as bogus data
// (scrapers sometimes emit year 2099 placeholders).
const MAX_DAYS_AHEAD = 540; // ~18 months

export interface ValidationOptions {
  // City centroid + max distance: reject events stamped far from where they
  // claim to be (catches an aggregator spilling another city's events).
  cityLat?: number;
  cityLng?: number;
  maxKm?: number;
}

export interface ValidationResult { ok: boolean; reason?: string }

function titleOf(p: ApiPost): string {
  return (p.caption || '').split('\n')[0].trim();
}

export function validateEventPost(p: ApiPost, opts: ValidationOptions = {}): ValidationResult {
  if (!p || !p.id) return { ok: false, reason: 'no-id' };

  // ── Title sanity ──────────────────────────────────────────────────────────
  const title = titleOf(p);
  if (title.length < 4 || title.length > 240) return { ok: false, reason: 'title-length' };
  if (!HAS_LETTERS_RE.test(title)) return { ok: false, reason: 'title-no-letters' };
  if (JUNK_TITLE_RE.test(title)) return { ok: false, reason: 'junk-title' };
  if (SPAM_RE.test(p.caption || '')) return { ok: false, reason: 'spam' };

  // Corrupt encoding (mojibake / replacement chars) → drop.
  if ((p.caption || '').includes('�')) return { ok: false, reason: 'corrupt-encoding' };

  // ── Date sanity (events only) ─────────────────────────────────────────────
  if (p.isEvent && p.eventDateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.eventDateRaw)) return { ok: false, reason: 'bad-date-format' };
    const today = todayStr();
    if (p.eventDateRaw < today) return { ok: false, reason: 'past' };
    const ahead = (Date.parse(`${p.eventDateRaw}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(ahead) || ahead > MAX_DAYS_AHEAD) return { ok: false, reason: 'too-far-ahead' };
  }

  // ── Geo sanity ────────────────────────────────────────────────────────────
  const lat = p.location?.lat, lng = p.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'no-geo' };
  if (lat === 0 && lng === 0) return { ok: false, reason: 'null-island' };
  if (Math.abs(lat as number) > 90 || Math.abs(lng as number) > 180) return { ok: false, reason: 'geo-range' };
  if (opts.cityLat != null && opts.cityLng != null && opts.maxKm) {
    const d = haversineKm(opts.cityLat, opts.cityLng, lat as number, lng as number);
    if (d > opts.maxKm) return { ok: false, reason: 'mislocated' };
  }

  // ── Image sanity ──────────────────────────────────────────────────────────
  if (p.image && !/^(https?:\/\/|\/api\/)/.test(p.image)) return { ok: false, reason: 'bad-image-url' };

  return { ok: true };
}

// Filter + de-dupe a batch, returning only the rows that pass validation.
export function validateBatch(posts: ApiPost[], opts: ValidationOptions = {}): {
  valid: ApiPost[]; rejected: number; reasons: Record<string, number>;
} {
  const valid: ApiPost[] = [];
  const reasons: Record<string, number> = {};
  const seen = new Set<string>();
  let rejected = 0;
  for (const p of posts) {
    const r = validateEventPost(p, opts);
    if (!r.ok) { rejected++; reasons[r.reason ?? 'unknown'] = (reasons[r.reason ?? 'unknown'] ?? 0) + 1; continue; }
    const key = titleOf(p).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40) + '|' + (p.eventDateRaw ?? '');
    if (seen.has(key)) { rejected++; reasons['duplicate'] = (reasons['duplicate'] ?? 0) + 1; continue; }
    seen.add(key);
    valid.push(p);
  }
  return { valid, rejected, reasons };
}
