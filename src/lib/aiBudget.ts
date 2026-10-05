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

import { cacheGet, cacheIncr, cacheIncrBy } from '@/lib/serverCache';

function todayKey(): string {
  return `nova:aibudget:${new Date().toISOString().slice(0, 10)}`;
}

// Capped by DEFAULT, not only when someone remembers the env var — an unset
// variable used to mean "unlimited Anthropic spend". The free sources
// (Ticketmaster/SeatGeek/OSM/Wikipedia/DB) carry the feed once the cap is hit,
// so the worst case is a slightly thinner feed, never a surprise invoice.
// Set to 0 to disable the cap.
const DEFAULT_DAILY_BUDGET = 200;

function budget(): number {
  const raw = (process.env.AI_DAILY_BUDGET ?? '').trim();
  if (raw === '') return DEFAULT_DAILY_BUDGET;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_BUDGET;
  return n; // 0 = explicitly unlimited
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

// ── Spend cap in DOLLARS ─────────────────────────────────────────────────────
// The call counter above treats a one-paragraph rewrite and a four-search web
// hunt as the same "1", though the second costs ~20× more — and it only ever
// guarded ONE of the app's Claude call sites. This cap is measured from the
// usage Anthropic reports on every response, and is enforced inside the one
// function every Claude call goes through (claudeAI.callClaude, plus /api/chat).
//
// Once the day's spend reaches AI_DAILY_BUDGET_USD, Claude is skipped until the
// UTC reset and the app runs on its free sources — the same graceful path it
// already takes when the account is out of credit.
//
// It is a soft cap: calls already in flight when it's reached still finish,
// so a day can overshoot by a few cents. That's the price of not making every
// request wait on a lock.

/** Claude Haiku 4.5 list prices, USD per token (anthropic.com/pricing). */
const HAIKU_45 = {
  input: 1 / 1_000_000,
  output: 5 / 1_000_000,
  cacheWrite: 1.25 / 1_000_000,
  cacheRead: 0.1 / 1_000_000,
  webSearch: 10 / 1_000,   // $10 per 1,000 searches
};

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
}

/** What one response cost, in USD, from its own `usage` block. */
export function claudeCostUsd(usage: ClaudeUsage | undefined): number {
  if (!usage) return 0;
  const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return n(usage.input_tokens) * HAIKU_45.input
    + n(usage.output_tokens) * HAIKU_45.output
    + n(usage.cache_creation_input_tokens) * HAIKU_45.cacheWrite
    + n(usage.cache_read_input_tokens) * HAIKU_45.cacheRead
    + n(usage.server_tool_use?.web_search_requests) * HAIKU_45.webSearch;
}

// $0.50/day ≈ $15/month at most. Enough for the AI web search to fill in a
// few dozen thin cities a day on top of the free sources, which carry the
// feed everywhere else. Set AI_DAILY_BUDGET_USD to move it; 0 = no cap.
export const DEFAULT_DAILY_BUDGET_USD = 0.5;

export function dailyBudgetUsd(raw = process.env.AI_DAILY_BUDGET_USD): number {
  const s = (raw ?? '').trim();
  if (s === '') return DEFAULT_DAILY_BUDGET_USD;
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0) return DEFAULT_DAILY_BUDGET_USD;   // typo → stay safe
  return v;
}

function spendKey(): string {
  return `nova:aispend:${new Date().toISOString().slice(0, 10)}`;
}

/** Whether today's Claude spend has reached the cap. */
export async function aiSpendExceeded(): Promise<boolean> {
  const cap = dailyBudgetUsd();
  if (cap <= 0) return false;
  const microUsd = (await cacheGet<number>(spendKey())) ?? 0;
  return microUsd >= cap * 1_000_000;
}

/** Add one response's cost to today's total. Never throws. */
export async function recordAiSpend(usage: ClaudeUsage | undefined): Promise<void> {
  const micro = Math.round(claudeCostUsd(usage) * 1_000_000);
  if (micro <= 0) return;
  await cacheIncrBy(spendKey(), micro, 60 * 60 * 26);
}

/** Today's spend so far, in USD — for the brain self-report. */
export async function aiSpendToday(): Promise<number> {
  return ((await cacheGet<number>(spendKey())) ?? 0) / 1_000_000;
}
