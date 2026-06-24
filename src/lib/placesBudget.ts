// ─────────────────────────────────────────────────────────────────────────────
// Google Places spend guardrail (real venue photos).
//
// A Place Photo lookup costs money: a Find-Place call (~$0.017) + a Photo call
// (~$0.007) ≈ $0.024 per UNIQUE venue (Google also grants ~$200/month free, so
// the first ~8,000 lookups/month are free). Because the feed and DB cache their
// results, the number of *unique* lookups is bounded — but a big ingestion sweep
// or a traffic spike could still run it up. This is a soft daily cap: once
// PLACES_DAILY_BUDGET photo lookups have been made in a UTC day, we stop calling
// Places and fall back to the free photo sources (OSM image tags → og:image →
// stock), so cost can never surprise you.
//
// Backed by the atomic Redis counter (resets daily). FULLY GATED:
//   • no PLACES_DAILY_BUDGET env → no cap (unchanged behaviour)
//   • no Redis configured        → no cap (can't count, so never blocks)
//   • no GOOGLE_PLACES_API_KEY   → Places is never called anyway
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheIncr } from '@/lib/serverCache';

function todayKey(): string {
  return `nova:placesbudget:${new Date().toISOString().slice(0, 10)}`;
}

function budget(): number {
  const raw = parseInt(process.env.PLACES_DAILY_BUDGET || '0', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
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
