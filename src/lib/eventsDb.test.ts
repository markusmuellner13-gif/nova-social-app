import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventRow } from './eventsDb';

// ─────────────────────────────────────────────────────────────────────────────
// upsertEvents is the write that took production down on Sept 8–14: ten slices
// logged `[eventsDb/upsert] Gateway Timeout`, and because the call had no
// timeout of its own the Vercel function was killed at 60s before it could
// return a `nextOffset` — which stopped the ingest chain and sent the "workflow
// failed" mail. These tests pin the three properties that prevent that:
//
//   • it is time-boxed, always, and returns rather than hanging;
//   • it makes partial progress instead of losing the whole batch;
//   • it never throws, whatever the database does.
// ─────────────────────────────────────────────────────────────────────────────

// A stand-in for the supabase client's fluent builder. Each `upsert(...)` is one
// request; `plan` decides what that request does, per call.
interface Attempt { rows: number; timeoutMs: number | null }

let attempts: Attempt[] = [];
let plan: ((attempt: number, rows: number) => Promise<{ error: { message: string } | null }>) = async () => ({ error: null });

function makeBuilder(rows: unknown[]) {
  let timeoutMs: number | null = null;
  const builder = {
    abortSignal(signal: AbortSignal) {
      // AbortSignal.timeout() doesn't expose its duration, so the production
      // call passes through a spy on AbortSignal.timeout instead (below).
      void signal;
      timeoutMs = lastTimeoutMs;
      return builder;
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      const n = attempts.length;
      attempts.push({ rows: rows.length, timeoutMs });
      return plan(n, rows.length).then(resolve, reject);
    },
  };
  return builder;
}

let lastTimeoutMs = 0;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      upsert: (rows: unknown[]) => makeBuilder(rows),
      select: () => ({
        lt: () => ({ limit: () => ({ abortSignal: async () => ({ data: [], error: null }) }) }),
      }),
      delete: () => ({ in: () => ({ abortSignal: async () => ({ error: null }) }) }),
    }),
  }),
}));

// The module reads env at import time, so these must be set before the dynamic
// import below.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

const { upsertEvents } = await import('./eventsDb');

function rows(n: number): EventRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `row_${i}`,
    source: 'test',
    category: 'events',
    raw: { id: `row_${i}` } as never,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }));
}

const GATEWAY_TIMEOUT = { message: 'Gateway Timeout' };

describe('upsertEvents', () => {
  beforeEach(() => {
    attempts = [];
    plan = async () => ({ error: null });
    lastTimeoutMs = 0;
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(((ms: number) => {
      lastTimeoutMs = ms;
      return new AbortController().signal;
    }) as typeof AbortSignal.timeout);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes everything and reports the true count', async () => {
    expect(await upsertEvents(rows(20))).toBe(20);
    expect(attempts).toHaveLength(1);
  });

  it('no-ops on an empty batch without touching the database', async () => {
    expect(await upsertEvents([])).toBe(0);
    expect(attempts).toHaveLength(0);
  });

  it('splits a large batch into chunks, so one stall costs one chunk', async () => {
    // The old code sent all rows as a single request. A batch that stalls then
    // loses everything AND holds the function open; chunking bounds both.
    await upsertEvents(rows(60));
    expect(attempts.length).toBeGreaterThan(1);
    expect(Math.max(...attempts.map(a => a.rows))).toBeLessThanOrEqual(25);
  });

  it('gives every request a timeout — the missing piece that killed the function', async () => {
    await upsertEvents(rows(60));
    for (const a of attempts) {
      expect(a.timeoutMs).toBeGreaterThan(0);
      expect(a.timeoutMs).toBeLessThanOrEqual(12_000);
    }
  });

  it('never lets a request outlive the caller-supplied budget', async () => {
    await upsertEvents(rows(25), { budgetMs: 3_000 });
    expect(attempts[0].timeoutMs).toBeLessThanOrEqual(3_000);
  });

  it('retries a Gateway Timeout once — queueing for a connection is transient', async () => {
    plan = async (n) => (n === 0 ? { error: GATEWAY_TIMEOUT } : { error: null });
    expect(await upsertEvents(rows(10))).toBe(10);
    expect(attempts).toHaveLength(2);
  });

  it('retries an aborted request too', async () => {
    plan = async (n) => {
      if (n === 0) throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
      return { error: null };
    };
    expect(await upsertEvents(rows(10))).toBe(10);
    expect(attempts).toHaveLength(2);
  });

  it('does NOT retry a fault that will fail identically twice', async () => {
    // A constraint violation is not a stall. Retrying it just burns budget the
    // remaining chunks need.
    plan = async () => ({ error: { message: 'duplicate key value violates unique constraint' } });
    expect(await upsertEvents(rows(10))).toBe(0);
    expect(attempts).toHaveLength(1);
  });

  it('keeps the chunks that worked when one chunk fails for good', async () => {
    // Partial progress is real progress: those rows are in the database and the
    // slice still returns, so the chain continues.
    plan = async () => (attempts.length === 1 ? { error: { message: 'bad request' } } : { error: null });
    const written = await upsertEvents(rows(75));
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(75);
  });

  it('stops mid-batch when the budget runs out, keeping what it wrote', async () => {
    // 200 rows = 8 chunks at ~120ms each, against a 500ms budget. It must write
    // some, stop when time is up, and report the real number — the behaviour
    // that lets a slice still return a nextOffset instead of being killed.
    plan = async () => {
      await new Promise(r => setTimeout(r, 120));
      return { error: null };
    };
    const written = await upsertEvents(rows(200), { budgetMs: 500 });
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(200);
    expect(written % 25).toBe(0);
    expect(attempts.length).toBeLessThan(8);
  });

  it('attempts at least one chunk even on a very short budget', async () => {
    // A tiny budget used to write NOTHING: the loop refused to start a request
    // it could not guarantee finishing. Now every request is hard-bounded, so
    // trying is free — and writing 25 rows beats writing none.
    expect(await upsertEvents(rows(25), { budgetMs: 1_000 })).toBe(25);
    expect(attempts).toHaveLength(1);
  });

  it('never throws, whatever the database does', async () => {
    plan = async () => { throw new Error('connection reset'); };
    await expect(upsertEvents(rows(30))).resolves.toBeTypeOf('number');
  });
});
