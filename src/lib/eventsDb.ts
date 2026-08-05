// Server-only: the app's OWN events database (Supabase Postgres + PostGIS).
//
// Reads use the public anon key (RLS allows public SELECT) and the events_near()
// geo RPC. Writes (ingestion) use the service-role key. Everything no-ops if the
// relevant key is missing, so /api/feed falls back to the live-API path and the
// app keeps working exactly as before.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ApiPost } from '@/lib/sources/shared';
import { enforceRealImages } from '@/lib/sources/realImage';

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
    title: post.caption?.split('\n')[0]?.slice(0, 300) ?? null,
    description: post.caption ?? null,
    city: post.location?.name?.split(',').slice(-1)[0]?.trim() ?? null,
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

// Upsert a batch of events (ingestion). Returns how many were written.
export async function upsertEvents(rows: EventRow[]): Promise<number> {
  if (!writeClient || rows.length === 0) return 0;
  const { error } = await writeClient.from('events').upsert(rows, { onConflict: 'id' });
  if (error) { console.error('[eventsDb/upsert]', error.message); return 0; }
  return rows.length;
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

// Housekeeping: delete long-expired rows (called by the ingest cron).
export async function purgeExpiredEvents(): Promise<void> {
  if (!writeClient) return;
  await writeClient.from('events').delete().lt('expires_at', new Date().toISOString());
}
