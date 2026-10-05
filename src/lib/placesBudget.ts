// ─────────────────────────────────────────────────────────────────────────────
// Google Places spend guardrail (real venue photos).
//
// What a venue photo costs (Places API New, prices checked 2026-10-05):
//   • finding the place (Text Search, IDs only)       — free, unlimited
//   • asking for its photos (Place Details, IDs only) — free, unlimited
//   • downloading the photo (Place Details Photos)    — 1,000/month free, then $7 per 1,000
// So this caps the ONE billed step: photo downloads per UTC day. Lookups that
// end in "no photo" cost nothing and aren't counted, and every answer is
// remembered in Redis for days (venuePhoto.ts), so the budget goes to new
// venues only. Once it's used up, Places is skipped until the reset and posts
// fall back to the free photo sources (OSM tags, Wikidata, the venue's site).
//
// Backed by the atomic Redis counter (resets daily). Without Redis there is
// nothing to count with, so it never blocks. No GOOGLE_PLACES_API_KEY → Places
// is never called anyway.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheIncr } from '@/lib/serverCache';

function todayKey(): string {
  return `nova:placesbudget:${new Date().toISOString().slice(0, 10)}`;
}

// A cost guard that only works once you remember to set an env var is not a
// guard. Places went from silently failing (and therefore free) to actually
// working, so an unset variable now means "unlimited spend on a live paid API" —
// the one default a production app must never have. The cap applies by DEFAULT
// and the env var only moves it.
//
// 100 photos/day ≈ 3,000/month: ~1,000 inside Google's free allowance, at most
// ~2,000 billed ≈ $14/month worst case — in practice far less, because each
// venue's photo is fetched once and then remembered. Raising it is a
// deliberate decision to spend money; 0 disables the cap entirely.
const DEFAULT_DAILY_BUDGET = 100;

function budget(): number {
  const raw = (process.env.PLACES_DAILY_BUDGET ?? '').trim();
  if (raw === '') return DEFAULT_DAILY_BUDGET;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_BUDGET; // typo → stay safe
  return n; // 0 = explicitly unlimited
}

// Check (without incrementing) whether we're already at/over the daily cap.
export async function placesBudgetExceeded(): Promise<boolean> {
  const cap = budget();
  if (cap <= 0) return false; // no cap configured → unlimited (or rely on key)
  const used = (await cacheGet<number>(todayKey())) ?? 0;
  return used >= cap;
}

// Record one Places photo lookup. No-ops (and never blocks) without Redis.
export async function notePlacesCall(): Promise<void> {
  if (budget() <= 0) return;
  await cacheIncr(todayKey(), 60 * 60 * 26); // ~26h TTL covers the UTC day
}
