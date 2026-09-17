// Server-only: the app's OWN events database (Supabase Postgres + PostGIS).
//
// Reads use the public anon key (RLS allows public SELECT) and the events_near()
// geo RPC. Writes (ingestion) use the service-role key. Everything no-ops if the
// relevant key is missing, so /api/feed falls back to the live-API path and the
// app keeps working exactly as before.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cacheIncr } from './serverCache';
import { canonicalCity } from './cityName';
import type { ApiPost } from '@/lib/sources/shared';
import { enforceRealImages } from '@/lib/sources/realImage';
import { cleanTitle, titleFromCaption } from './postTitle';

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const readClient: SupabaseClient | null  = url && anonKey    ? createClient(url, anonKey, noSession)    : null;
const writeClient: SupabaseClient | null = url && serviceKey ? createClient(url, serviceKey, noSession) : null;

export const dbReadEnabled  = readClient !== null;
export const dbWriteEnabled = writeClient !== null;

// Rows ingested before the stand-in photo sources were removed still carry a
// stock/filler URL in `raw.image`. Cleaning on the way OUT (rather than
// migrating the table) means the fix applies to every stored row immediately,
// including ones a cron re-writes later, and there is no window where the old
// images come back.
function readPosts(data: unknown): ApiPost[] {
  const posts = ((data ?? []) as { raw: ApiPost }[]).map(r => r.raw).filter(Boolean);
  return enforceRealImages(posts);
}

// A row ready to upsert. `raw` is the full feed-ready post object the client renders.
export interface EventRow {
  id: string;
  source: string;
  category: string;
  title?: string | null;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  venue?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_at?: string | null;     // ISO timestamptz
  end_at?: string | null;
  event_date_raw?: string | null;
  price?: string | null;
  image?: string | null;
  url?: string | null;
  organizer?: string | null;
  is_event?: boolean;
  popularity?: number;
  raw: ApiPost;
  expires_at: string;           // ISO timestamptz — required
}

// Build an EventRow from a feed post object produced by the source modules.
// `country` comes from the ingest work item (the feed payload carries it at the
// top level, individual posts don't), so we can store it on the row for
// country-level fallback queries.
export function postToRow(post: ApiPost & { eventDateRaw?: string | null }, source: string, country?: string | null, defaultExpiryDays = 3): EventRow {
  const now = Date.now();
  const startMs = post.eventDateRaw ? Date.parse(`${post.eventDateRaw}T00:00:00Z`) : NaN;
  // Events expire the day after they happen; places/no-date rows live a few days.
  const expiresMs = Number.isFinite(startMs)
    ? startMs + 36 * 60 * 60 * 1000
    : now + defaultExpiryDays * 24 * 60 * 60 * 1000;
  return {
    id: post.id,
    source,
    category: post.category,
    // The source's REAL event name. This used to be `caption.split('\n')[0]`,
    // which is why production stored titles like "https://allevents.in/org/…"
    // and "Registration opens 3 weeks before the…" — see src/lib/postTitle.ts.
    // The caption line stays as a fallback for sources that carry no name, but
    // it now goes through cleanTitle so a URL can never be stored as a title.
    title: cleanTitle(post.title, 300) || titleFromCaption(post.caption, 300) || null,
    description: post.caption ?? null,
    // Canonicalised so German/Italian/etc. sources don't create a second row for
    // a city we already have — "Wien" and "Vienna" were two buckets, splitting
    // Vienna's corpus 314/107 and shrinking the feed for whoever landed in the
    // smaller one. See src/lib/cityName.ts.
    city: canonicalCity(post.location?.name?.split(',').slice(-1)[0]),
    country: country ?? null,
    venue: post.eventVenue ?? null,
    lat: post.location?.lat ?? null,
    lng: post.location?.lng ?? null,
    start_at: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    event_date_raw: post.eventDateRaw ?? null,
    price: post.price ?? null,
    image: post.image ?? null,
    url: post.eventUrl ?? null,
    organizer: post.organizer ?? null,
    is_event: post.isEvent ?? true,
    popularity: post.likes ?? 0,
    raw: post,
    expires_at: new Date(expiresMs).toISOString(),
  };
}

// ── Writing, without betting the whole function on one request ───────────────
//
// Between Sept 8 and 14, ten ingest slices logged `[eventsDb/upsert] Gateway
// Timeout`. It is worth being precise about what that was, because the obvious
// reading is wrong.
//
// MEASURED, from pg_stat_statements (unreset since 2026-06-06, so it covers the
// whole window): the upsert ran 60,334 times with a mean of 32ms and a MAXIMUM
// of 583ms. Not one execution was slow, and a lock wait would have shown up here
// as execution time. So the statement never struggled — the request never
// reached Postgres. It queued in front of it, at PostgREST's connection pool
// (max_connections is 60, and the pool is a slice of that), while dozens of
// ingest slices, background persists and user requests all competed for it, and
// the gateway gave up at 60 seconds.
//
// That is a load problem, and it was made much worse by sheer request volume:
// `purgeExpiredEvents` alone accounts for 23,359 calls — see the note down
// there. It is now ~1/hour rather than one per slice.
//
// The failure mode is what made it serious. The upsert had NO timeout of its
// own, so a queued request held the Vercel function until the platform killed it
// at 60s — and a killed slice returns no `nextOffset`, which stops the whole
// chain and is what sends the "workflow failed" mail. So:
//
//   1. every request is time-boxed, so it can never outlive its caller;
//   2. rows go in chunks, so a stall costs one chunk instead of the batch, and
//      each request holds a pool connection for less time;
//   3. a timed-out chunk is retried once — queueing is transient;
//   4. failures return a count, never throw. Partial progress is real progress.
//
// supabase/migrations/008_events_write_timeouts.sql adds server-side timeouts as
// a backstop. That is insurance, not the fix — the fix is fewer, smaller,
// time-boxed requests.

const UPSERT_CHUNK = 25;          // ~95 KB of JSONB per request at our row size
const UPSERT_TIMEOUT_MS = 12_000; // one chunk, one attempt
const UPSERT_RETRY_WAIT_MS = 400;
export const UPSERT_DEFAULT_BUDGET_MS = 25_000;

function isTransientDbError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('timeout') || m.includes('timed out') || m.includes('gateway')
      || m.includes('abort')   || m.includes('lock')      || m.includes('deadlock')
      || m.includes('fetch failed') || m.includes('econnreset');
}

// One chunk, one attempt. Returns null on success, or the failure message.
async function upsertChunk(rows: EventRow[], timeoutMs: number): Promise<string | null> {
  try {
    const { error } = await writeClient!
      .from('events')
      .upsert(rows, { onConflict: 'id' })
      .abortSignal(AbortSignal.timeout(timeoutMs));
    return error ? error.message : null;
  } catch (err) {
    // An aborted request rejects rather than returning an error object.
    return err instanceof Error ? err.message : 'upsert failed';
  }
}

/**
 * Upsert a batch of events (ingestion). Returns how many rows were actually
 * written — which may be fewer than `rows.length` if the budget ran out. Never
 * throws and never runs longer than `budgetMs`.
 */
export async function upsertEvents(
  rows: EventRow[],
  opts: { budgetMs?: number } = {},
): Promise<number> {
  if (!writeClient || rows.length === 0) return 0;

  const deadline = Date.now() + Math.max(1_000, opts.budgetMs ?? UPSERT_DEFAULT_BUDGET_MS);
  let written = 0;
  let firstError: string | null = null;

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const remaining = deadline - Date.now();
    // Stop cleanly rather than starting a request there is no time for. The bar
    // is low on purpose: the request below is hard-bounded by `remaining`, so a
    // short attempt either lands or aborts harmlessly — it can no longer run on
    // past the caller. Refusing to try with a second left would just throw away
    // rows we could have written.
    if (remaining < 750) {
      console.error(`[eventsDb/upsert] budget exhausted — wrote ${written}/${rows.length} rows`);
      break;
    }

    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    let error = await upsertChunk(chunk, Math.min(UPSERT_TIMEOUT_MS, remaining));

    // One retry, and only for the stalls this is here to survive. A constraint
    // violation or a bad payload fails the same way twice.
    if (error && isTransientDbError(error)) {
      const left = deadline - Date.now();
      if (left > UPSERT_RETRY_WAIT_MS + 2_000) {
        await new Promise(r => setTimeout(r, UPSERT_RETRY_WAIT_MS));
        error = await upsertChunk(chunk, Math.min(UPSERT_TIMEOUT_MS, deadline - Date.now()));
      }
    }

    if (error) { firstError ??= error; continue; }
    written += chunk.length;
  }

  if (firstError) console.error('[eventsDb/upsert]', firstError, `— wrote ${written}/${rows.length} rows`);
  return written;
}

// Read feed-ready posts near a location, for one category, soonest first.
export async function queryEventsNear(opts: {
  lat: number; lng: number; radiusKm: number; category: string;
  afterIso?: string | null; limit: number; offset: number;
}): Promise<ApiPost[]> {
  if (!readClient) return [];
  const { data, error } = await readClient.rpc('events_near', {
    in_lat: opts.lat,
    in_lng: opts.lng,
    in_radius_km: opts.radiusKm,
    in_categories: [opts.category],
    in_after: opts.afterIso ?? null,
    in_limit: opts.limit,
    in_offset: opts.offset,
  });
  if (error) { console.error('[eventsDb/query]', error.message); return []; }
  return readPosts(data);
}

// Read feed-ready posts near a location across SEVERAL categories at once
// (soonest first). Powers the local chatbot brain, which matches a question to a
// set of categories and answers from one geo query instead of many.
export async function queryEventsNearAny(opts: {
  lat: number; lng: number; radiusKm: number; categories: string[];
  afterIso?: string | null; limit: number; offset: number;
}): Promise<ApiPost[]> {
  if (!readClient || opts.categories.length === 0) return [];
  const { data, error } = await readClient.rpc('events_near', {
    in_lat: opts.lat,
    in_lng: opts.lng,
    in_radius_km: opts.radiusKm,
    in_categories: opts.categories,
    in_after: opts.afterIso ?? null,
    in_limit: opts.limit,
    in_offset: opts.offset,
  });
  if (error) { console.error('[eventsDb/queryAny]', error.message); return []; }
  return readPosts(data);
}

// Top upcoming events near a point across the "going out" categories — powers
// the push digest so it can pull from concerts, sports, art, community, etc.,
// not just the generic events bucket.
const DIGEST_CATEGORIES = ['events', 'music', 'sports', 'art', 'community', 'venues'];

export async function queryTopEventsNear(opts: {
  lat: number; lng: number; radiusKm: number; limit: number;
}): Promise<ApiPost[]> {
  if (!readClient) return [];
  const { data, error } = await readClient.rpc('events_near', {
    in_lat: opts.lat,
    in_lng: opts.lng,
    in_radius_km: opts.radiusKm,
    in_categories: DIGEST_CATEGORIES,
    in_after: new Date().toISOString(),
    in_limit: opts.limit,
    in_offset: 0,
  });
  if (error) { console.error('[eventsDb/topNear]', error.message); return []; }
  return readPosts(data);
}

// Cold-start fallback: when nothing is happening within the user's radius (a tiny
// village with no nearby data even after radius expansion), serve upcoming events
// from anywhere in their country so the feed is never dead. Soonest first.
export async function queryEventsByCountry(opts: {
  country: string; category: string; limit: number; offset: number;
}): Promise<ApiPost[]> {
  if (!readClient || !opts.country) return [];
  const { data, error } = await readClient
    .from('events')
    .select('raw')
    .ilike('country', opts.country)
    .eq('category', opts.category)
    .gt('expires_at', new Date().toISOString())
    .order('start_at', { ascending: true, nullsFirst: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) { console.error('[eventsDb/byCountry]', error.message); return []; }
  return readPosts(data);
}

// A worldwide spread of live events for the globe view. Pulls the most popular
// upcoming events across every city/category we've ingested, so the World Map
// is covered with real pins instead of demo data. Public anon read (RLS).
export async function sampleEventsWorldwide(limit = 1500): Promise<ApiPost[]> {
  if (!readClient) return [];
  const { data, error } = await readClient
    .from('events')
    .select('raw')
    .gt('expires_at', new Date().toISOString())
    .not('lat', 'is', null)
    .order('popularity', { ascending: false })
    .limit(limit);
  if (error) { console.error('[eventsDb/sample]', error.message); return []; }
  return readPosts(data)
    .filter(p => p && p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng));
}

// ── Housekeeping ─────────────────────────────────────────────────────────────
//
// This used to be `DELETE FROM events WHERE expires_at < now()` with no bound
// and no timeout, run at the END OF EVERY SLICE — up to 18 times per workflow
// run, every 30 minutes, forever. pg_stat_statements has it at 23,359 calls,
// against 60,334 upserts: more than a third of all the write traffic this app
// generates was this one statement, tidying up after itself.
//
// The DELETE is fast (mean 1.1ms), so it was never slow — it was just constant,
// and every call occupies a PostgREST pool connection that an ingest upsert then
// has to queue behind. That queueing is what the `Gateway Timeout` entries
// actually were.
//
// And it bought nothing. Expired rows are already invisible to readers (every
// query filters `expires_at > now()`), so deleting them is pure housekeeping and
// can happen once an hour instead of eighteen times a run.
//
// Now: at most one purge an hour app-wide, a bounded number of rows, and a hard
// timeout. Deleting by explicit id list keeps each statement small and known.

const PURGE_LOCK_TTL_S = 60 * 60;
const PURGE_MAX_ROWS = 500;
const PURGE_TIMEOUT_MS = 8_000;
// Expired rows are harmless, so let them settle before deleting. This keeps the
// purge off rows an in-flight ingest may be re-upserting right now.
const PURGE_GRACE_MS = 60 * 60 * 1000;

/**
 * Whether this invocation is the one that should purge. Backed by an atomic
 * Redis counter so only the first caller in the hour does the work. Without
 * Redis there is nothing to coordinate with, so fall back to a 1-in-12 chance —
 * roughly once per workflow run, instead of once per slice.
 */
async function shouldPurgeNow(): Promise<boolean> {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const n = await cacheIncr(`nova:purge:${hour}`, PURGE_LOCK_TTL_S);
  if (n === null) return Math.random() < 1 / 12;
  return n === 1;
}

/** Delete a bounded slice of long-expired rows. Never throws, never blocks. */
export async function purgeExpiredEvents(opts: { force?: boolean } = {}): Promise<number> {
  if (!writeClient) return 0;
  if (!opts.force && !(await shouldPurgeNow())) return 0;

  const cutoff = new Date(Date.now() - PURGE_GRACE_MS).toISOString();
  try {
    const { data, error } = await writeClient
      .from('events')
      .select('id')
      .lt('expires_at', cutoff)
      .limit(PURGE_MAX_ROWS)
      .abortSignal(AbortSignal.timeout(PURGE_TIMEOUT_MS));
    if (error || !data?.length) return 0;

    const ids = (data as { id: string }[]).map(r => r.id);
    const { error: delError } = await writeClient
      .from('events')
      .delete()
      .in('id', ids)
      .abortSignal(AbortSignal.timeout(PURGE_TIMEOUT_MS));
    if (delError) { console.error('[eventsDb/purge]', delError.message); return 0; }
    return ids.length;
  } catch (err) {
    console.error('[eventsDb/purge]', err instanceof Error ? err.message : 'purge failed');
    return 0;
  }
}
