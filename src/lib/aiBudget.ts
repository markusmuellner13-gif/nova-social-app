// ─────────────────────────────────────────────────────────────────────────────
// AI spend guardrail.
//
// The feed's Claude web-search fallback is the single most expensive call in the
// app (credits per scroll when free sources are thin). At scale, or during a
// large ingestion sweep, that can run away. This is a soft daily cap: once we've
// made AI_DAILY_BUDGET Claude calls in a UTC day, the fallback is skipped and the
// feed serves only the free sources (Ticketmaster/SeatGeek/OSM/Wikipedia/DB).
//
// Backed by the atomic Redis counter (resets daily). FULLY GATED:
//   • no AI_DAILY_BUDGET env  → no cap (unchanged behaviour)
//   • no Redis configured     → no cap (can't count, so never blocks)
// so nothing changes until you opt in by setting the env var.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheIncr } from '@/lib/serverCache';

function todayKey(): string {
  return `nova:aibudget:${new Date().toISOString().slice(0, 10)}`;
}

function budget(): number {
  const raw = parseInt(process.env.AI_DAILY_BUDGET || '0', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

// Check (without incrementing) whether we're already at/over the daily cap.
export async function aiBudgetExceeded(): Promise<boolean> {
  const cap = budget();
  if (cap <= 0) return false; // no cap configured
  const used = (await cacheGet<number>(todayKey())) ?? 0;
  return used >= cap;
}

// Record one AI call. Returns false when the call pushed us over the cap (so the
// caller can avoid further AI work this request). No-ops without Redis.
export async function noteAiCall(): Promise<boolean> {
  const cap = budget();
  if (cap <= 0) return true;
  const n = await cacheIncr(todayKey(), 60 * 60 * 26); // ~26h TTL covers the UTC day
  if (n === null) return true; // no Redis → don't block
  return n <= cap;
}
