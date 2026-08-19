// Turning loosely-typed extracted values into a clean ExtractedRecord.
//
// Every reader — built-in or learned — funnels through `toRecord`, so decoding,
// URL resolution and type coercion are done in exactly one place. When a page
// gives us a relative link or an HTML-escaped title, this is where it stops.

import type { ExtractedRecord, FieldName, RecordKind } from './types';
import { isUsableRecord } from './validate';
import { decodeEntities } from '@/lib/htmlEntities';

function str(v: unknown, max = 500): string | undefined {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  const s = decodeEntities(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

function numOf(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Resolve a possibly-relative URL against the page it was found on. */
export function absoluteUrl(raw: unknown, base?: string): string | undefined {
  const s = str(raw, 2000);
  if (!s) return undefined;
  if (s.startsWith('//')) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  if (!base) return undefined;
  try { return new URL(s, base).toString(); } catch { return undefined; }
}

/** Epoch numbers appear in app state far more often than in schema.org. */
function dateOf(v: unknown): string | undefined {
  if (typeof v === 'number') {
    const ms = v > 1e11 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return str(v, 40);
}

/**
 * Build a record from field values, or return null if it isn't worth keeping.
 * `kind` is the caller's best guess; a dated record is always an event.
 */
export function toRecord(
  vals: Partial<Record<FieldName, unknown>>,
  opts: { kind: RecordKind; baseUrl?: string; via?: string },
): ExtractedRecord | null {
  const { kind, baseUrl, via } = opts;
  const startDate = dateOf(vals.startDate);
  const rec: Partial<ExtractedRecord> = {
    kind: startDate ? 'event' : kind,
    name: str(vals.name, 200) ?? '',
    description: str(vals.description, 800),
    startDate,
    endDate: dateOf(vals.endDate),
    url: absoluteUrl(vals.url, baseUrl),
    ticketUrl: absoluteUrl(vals.ticketUrl, baseUrl),
    image: absoluteUrl(vals.image, baseUrl),
    venue: str(vals.venue, 140),
    street: str(vals.street, 180),
    locality: str(vals.locality, 90),
    region: str(vals.region, 90),
    country: str(vals.country, 70),
    lat: numOf(vals.lat),
    lng: numOf(vals.lng),
    price: str(vals.price, 40),
    currency: str(vals.currency, 8),
    rating: numOf(vals.rating),
    duration: str(vals.duration, 60),
    openingHours: str(vals.openingHours, 300),
    organizer: str(vals.organizer, 140),
    via,
  };
  for (const k of Object.keys(rec) as (keyof ExtractedRecord)[]) {
    if (rec[k] === undefined) delete rec[k];
  }
  return isUsableRecord(rec) ? rec : null;
}
