'use client';

import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Returns null if Supabase is not configured — app gracefully falls back to local state
export const supabase = url && key ? createClient(url, key) : null;

export type SupabaseProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
};

export type SupabaseGroup = {
  id: string;
  name: string;
  description?: string;
  code: string;
  created_by: string;
  created_at: string;
  member_count?: number;
};

export type SupabaseGroupEvent = {
  id: string;
  group_id: string;
  added_by: string;
  post_id: string;
  post_data: Record<string, unknown>;
  created_at: string;
  adder_name?: string;
};

// ── Auth helpers ─────────────────────────────────────────────────────────────

export async function signUpEmail(email: string, password: string, username: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username, display_name: username } },
  });
  if (error) throw error;
  return data;
}

export async function signInEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInGoogle() {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── Profile helpers ───────────────────────────────────────────────────────────

export async function upsertProfile(profile: Partial<SupabaseProfile> & { id: string }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('[supabase/upsertProfile]', error);
  return data;
}

export async function getProfile(userId: string) {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data as SupabaseProfile | null;
}

export async function searchProfiles(query: string) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .ilike('username', `%${query}%`)
    .limit(10);
  return (data ?? []) as SupabaseProfile[];
}

// ── Following helpers ──────────────────────────────────────────────────────────

export async function followUser(followerId: string, followingId: string) {
  if (!supabase) return;
  await supabase.from('follows').upsert({ follower_id: followerId, following_id: followingId });
}

export async function unfollowUser(followerId: string, followingId: string) {
  if (!supabase) return;
  await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
}

export async function getFollowing(userId: string) {
  if (!supabase) return [];
  const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
  return (data ?? []).map((r: { following_id: string }) => r.following_id);
}

export async function getFollowers(userId: string): Promise<number> {
  if (!supabase) return 0;
  const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
  return count ?? 0;
}

async function profilesByIds(ids: string[]): Promise<SupabaseProfile[]> {
  if (!supabase || ids.length === 0) return [];
  const { data } = await supabase.from('profiles').select('*').in('id', ids.slice(0, 100));
  return (data ?? []) as SupabaseProfile[];
}

// People this user follows, as full profiles
export async function getFollowingProfiles(userId: string): Promise<SupabaseProfile[]> {
  return profilesByIds(await getFollowing(userId));
}

// People who follow this user, as full profiles
export async function getFollowerProfiles(userId: string): Promise<SupabaseProfile[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('follows').select('follower_id').eq('following_id', userId);
  return profilesByIds((data ?? []).map((r: { follower_id: string }) => r.follower_id));
}

// ── Groups helpers ─────────────────────────────────────────────────────────────

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createGroup(name: string, description: string, userId: string): Promise<SupabaseGroup | null> {
  if (!supabase) return null;
  const code = generateCode();
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, description, code, created_by: userId })
    .select()
    .single();
  if (error) { console.error('[supabase/createGroup]', error); return null; }
  // auto-join creator
  await supabase.from('group_members').insert({ group_id: data.id, user_id: userId });
  return data as SupabaseGroup;
}

export async function joinGroup(code: string, userId: string): Promise<SupabaseGroup | null> {
  if (!supabase) return null;
  const { data: group } = await supabase.from('groups').select('*').eq('code', code.toUpperCase()).single();
  if (!group) return null;
  await supabase.from('group_members').upsert({ group_id: group.id, user_id: userId });
  return group as SupabaseGroup;
}

export async function getUserGroups(userId: string): Promise<SupabaseGroup[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('group_members')
    .select('group_id, groups(*)')
    .eq('user_id', userId);
  return ((data ?? []).map((r: { groups: unknown }) => r.groups).filter(Boolean)) as SupabaseGroup[];
}

export async function getGroupEvents(groupId: string): Promise<SupabaseGroupEvent[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('group_events')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  return (data ?? []) as SupabaseGroupEvent[];
}

export async function addEventToGroup(groupId: string, userId: string, postId: string, postData: Record<string, unknown>) {
  if (!supabase) return;
  await supabase.from('group_events').upsert({ group_id: groupId, added_by: userId, post_id: postId, post_data: postData });
}

export async function removeEventFromGroup(groupId: string, postId: string) {
  if (!supabase) return;
  await supabase.from('group_events').delete().eq('group_id', groupId).eq('post_id', postId);
}

// ── Post interactions (likes, saves, going) ───────────────────────────────────

export type InteractionType = 'like' | 'save' | 'going';

export async function upsertInteraction(
  userId: string, postId: string, type: InteractionType,
  postData?: Record<string, unknown>
) {
  if (!supabase) return;
  const row = { user_id: userId, post_id: postId, interaction_type: type };
  if (postData) {
    // Store the full post snapshot so other signed-in devices can display it.
    // Falls back to a plain row if the post_data column doesn't exist yet
    // (supabase/migrations/002_post_snapshots.sql not run).
    const { error } = await supabase.from('post_interactions').upsert({ ...row, post_data: postData });
    if (!error) return;
  }
  await supabase.from('post_interactions').upsert(row);
}

export async function deleteInteraction(userId: string, postId: string, type: InteractionType) {
  if (!supabase) return;
  await supabase.from('post_interactions').delete()
    .eq('user_id', userId).eq('post_id', postId).eq('interaction_type', type);
}

interface InteractionRow { post_id: string; interaction_type: string; post_data?: Record<string, unknown> | null }

export async function getUserInteractions(userId: string): Promise<{
  likedPosts: string[]; savedPosts: string[]; goingPosts: string[];
  posts: Record<string, unknown>[];
} | null> {
  if (!supabase) return null;
  // Prefer the snapshot column; fall back for projects without the migration
  let rows: InteractionRow[] | null =
    (await supabase.from('post_interactions').select('post_id, interaction_type, post_data').eq('user_id', userId)).data;
  if (!rows) {
    rows = (await supabase.from('post_interactions').select('post_id, interaction_type').eq('user_id', userId)).data;
  }
  if (!rows) return null;

  const posts: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.post_data && typeof r.post_data === 'object' && !seen.has(r.post_id)) {
      seen.add(r.post_id);
      posts.push(r.post_data);
    }
  }
  return {
    likedPosts: rows.filter(r => r.interaction_type === 'like').map(r => r.post_id),
    savedPosts: rows.filter(r => r.interaction_type === 'save').map(r => r.post_id),
    goingPosts: rows.filter(r => r.interaction_type === 'going').map(r => r.post_id),
    posts,
  };
}
