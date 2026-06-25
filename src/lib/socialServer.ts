// Server-only social queries that run with the service-role key (cron context),
// so they bypass RLS safely on the backend. Used by the push digest to surface
// "a friend is going to an event near you" — the strongest retention nudge.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const admin: SupabaseClient | null = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const socialServerEnabled = admin !== null;

export interface FriendGoingEvent {
  friendName: string;
  title: string;
  postId: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function isUpcoming(eventDateRaw: unknown): boolean {
  if (typeof eventDateRaw !== 'string' || !eventDateRaw) return true; // undated → keep
  const t = Date.parse(`${eventDateRaw}T00:00:00Z`);
  if (!Number.isFinite(t)) return true;
  return t >= Date.now() - 86_400_000; // today or future
}

// Find the nearest upcoming event that someone the user FOLLOWS has marked
// "going" to. Returns null when there's nothing relevant (no follows, none going,
// nothing nearby) so the caller falls back to the normal digest.
export async function friendsGoingNear(
  userId: string, lat: number, lng: number, radiusKm = 60,
): Promise<FriendGoingEvent | null> {
  if (!admin || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const { data: fol } = await admin.from('follows').select('following_id').eq('follower_id', userId);
  const ids = [...new Set((fol ?? []).map((r: { following_id: string }) => r.following_id))];
  if (ids.length === 0) return null;

  const { data: rows } = await admin
    .from('post_interactions')
    .select('post_id, user_id, post_data, created_at')
    .eq('interaction_type', 'going')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(60);
  if (!rows || rows.length === 0) return null;

  const { data: profs } = await admin.from('profiles').select('id, display_name').in('id', ids);
  const nameMap = new Map<string, string>(
    (profs ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? 'A friend']),
  );

  let best: FriendGoingEvent | null = null;
  for (const r of rows as { post_id: string; user_id: string; post_data: Record<string, unknown> | null }[]) {
    const pd = r.post_data;
    if (!pd || pd.isEvent === false) continue;
    const loc = pd.location as { lat?: number; lng?: number; name?: string } | undefined;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    if (!isUpcoming(pd.eventDateRaw)) continue;
    const d = km(lat, lng, loc.lat as number, loc.lng as number);
    if (d > radiusKm) continue;
    if (best && d >= best.distanceKm) continue;
    const title = (typeof pd.caption === 'string' ? pd.caption.split('\n')[0] : '') || loc.name || 'an event';
    best = {
      friendName: nameMap.get(r.user_id) ?? 'A friend',
      title: title.slice(0, 80),
      postId: r.post_id,
      lat: loc.lat as number,
      lng: loc.lng as number,
      distanceKm: Math.round(d),
    };
  }
  return best;
}
