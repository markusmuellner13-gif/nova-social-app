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

// captchaToken is from the Cloudflare Turnstile widget. It's only enforced once
// CAPTCHA is enabled in the Supabase dashboard (Auth → Settings → enable Turnstile)
// AND the site key is set; otherwise it's an empty string Supabase ignores, so
// signup keeps working before keys are configured.
export async function signUpEmail(email: string, password: string, username: string, captchaToken?: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username, display_name: username }, captchaToken: captchaToken || undefined },
  });
  if (error) throw error;
  return data;
}

export async function signInEmail(email: string, password: string, captchaToken?: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({
    email, password, options: { captchaToken: captchaToken || undefined },
  });
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

// Real aggregate "I'm going" counts for a set of posts. Reads the public,
// trigger-maintained post_going_counts table — anonymous counts only, never who.
// No Supabase configured → empty map (the UI falls back to the user's own state).
export async function getGoingCounts(postIds: string[]): Promise<Record<string, number>> {
  if (!supabase || postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('post_going_counts')
    .select('post_id, count')
    .in('post_id', postIds);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const r of data as { post_id: string; count: number }[]) {
    out[r.post_id] = Number(r.count) || 0;
  }
  return out;
}

export interface FriendGoing { id: string; name: string; avatar: string }

// Which of the people the user FOLLOWS are going to each of these posts. RLS
// only exposes followed-users' "going" rows (see the view_followed_users_going
// policy), so this is privacy-safe by construction. Returns up to a handful of
// friends per post (the caller shows a few + a count). No Supabase / not signed
// in → empty (the UI falls back to the plain aggregate count).
export async function getFriendsGoing(userId: string, postIds: string[]): Promise<Record<string, FriendGoing[]>> {
  if (!supabase || postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('post_interactions')
    .select('post_id, user_id')
    .eq('interaction_type', 'going')
    .in('post_id', postIds)
    .neq('user_id', userId); // RLS already limits to followed users; drop self
  if (error || !data) return {};
  const rows = data as { post_id: string; user_id: string }[];
  const friendIds = [...new Set(rows.map(r => r.user_id))];
  if (friendIds.length === 0) return {};

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', friendIds);
  const profMap = new Map<string, FriendGoing>();
  for (const p of (profs ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
    profMap.set(p.id, { id: p.id, name: p.display_name ?? 'A friend', avatar: p.avatar_url ?? '' });
  }
  const out: Record<string, FriendGoing[]> = {};
  for (const r of rows) {
    const f = profMap.get(r.user_id);
    if (f) (out[r.post_id] ??= []).push(f);
  }
  return out;
}

// Which members of a group are going to each of these events. RLS exposes group
// co-members' "going" rows (view_group_co-members_going), so a group can plan
// together — see who's in for each event. Returns post_id → member list.
export async function getGroupGoing(groupId: string, postIds: string[]): Promise<Record<string, FriendGoing[]>> {
  if (!supabase || postIds.length === 0) return {};
  const { data: mem } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
  const memberIds = (mem ?? []).map((r: { user_id: string }) => r.user_id);
  if (memberIds.length === 0) return {};

  const { data, error } = await supabase
    .from('post_interactions')
    .select('post_id, user_id')
    .eq('interaction_type', 'going')
    .in('post_id', postIds)
    .in('user_id', memberIds);
  if (error || !data) return {};
  const rows = data as { post_id: string; user_id: string }[];
  const goingIds = [...new Set(rows.map(r => r.user_id))];
  if (goingIds.length === 0) return {};

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', goingIds);
  const profMap = new Map<string, FriendGoing>();
  for (const p of (profs ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
    profMap.set(p.id, { id: p.id, name: p.display_name ?? 'A member', avatar: p.avatar_url ?? '' });
  }
  const out: Record<string, FriendGoing[]> = {};
  for (const r of rows) {
    const f = profMap.get(r.user_id);
    if (f) (out[r.post_id] ??= []).push(f);
  }
  return out;
}

// ── Post comments (public, per feed post) ─────────────────────────────────────

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  author_name?: string;
  author_avatar?: string;
  body: string;
  created_at: string;
}

// A post's real comment thread, oldest → newest. Readable by everyone; empty
// when Supabase isn't configured or nobody has commented yet.
export async function getPostComments(postId: string): Promise<PostComment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !data) return [];
  return data as PostComment[];
}

// Post a real comment. Returns the inserted row (so the UI can append it
// optimistically) or null when it failed / sync is disabled.
export async function addPostComment(
  postId: string, userId: string, body: string,
  authorName?: string, authorAvatar?: string,
): Promise<PostComment | null> {
  if (!supabase) return null;
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, body: trimmed, author_name: authorName, author_avatar: authorAvatar })
    .select()
    .single();
  if (error) { console.error('[supabase/addPostComment]', error); return null; }
  return data as PostComment;
}

export async function deletePostComment(commentId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('post_comments').delete().eq('id', commentId);
}

// ── Group event discussion (chat/comments on a shared group event) ────────────

export interface GroupEventComment {
  id: string;
  group_id: string;
  post_id: string;
  user_id: string;
  author_name?: string;
  author_avatar?: string;
  body: string;
  created_at: string;
}

// Fetch a group event's discussion thread, oldest → newest. RLS limits reads to
// members of the group. Empty when Supabase / the migration isn't set up.
export async function getGroupEventComments(groupId: string, postId: string): Promise<GroupEventComment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('group_event_comments')
    .select('*')
    .eq('group_id', groupId)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as GroupEventComment[];
}

// Post a message to a group event's thread. Returns the inserted row (so the UI
// can append it optimistically) or null if it failed / sync is disabled.
export async function addGroupEventComment(
  groupId: string, postId: string, userId: string,
  body: string, authorName?: string, authorAvatar?: string,
): Promise<GroupEventComment | null> {
  if (!supabase) return null;
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('group_event_comments')
    .insert({ group_id: groupId, post_id: postId, user_id: userId, body: trimmed, author_name: authorName, author_avatar: authorAvatar })
    .select()
    .single();
  if (error) { console.error('[supabase/addGroupEventComment]', error); return null; }
  return data as GroupEventComment;
}

export async function deleteGroupEventComment(commentId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('group_event_comments').delete().eq('id', commentId);
}

// Unread-ish helper: how many messages each event thread has, so the group list
// can show a 💬 count. One round-trip for all of a group's events.
export async function getGroupEventCommentCounts(groupId: string, postIds: string[]): Promise<Record<string, number>> {
  if (!supabase || postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('group_event_comments')
    .select('post_id')
    .eq('group_id', groupId)
    .in('post_id', postIds);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const r of data as { post_id: string }[]) out[r.post_id] = (out[r.post_id] ?? 0) + 1;
  return out;
}

// ── Group chat (live, WhatsApp-style, text + stickers) ────────────────────────

export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  author_name?: string;
  author_avatar?: string;
  kind: 'text' | 'sticker';
  body: string;
  created_at: string;
}

// Most-recent `limit` messages for a group, returned oldest → newest (ready to
// render top-to-bottom). RLS limits reads to members. Empty when Supabase / the
// migration isn't set up.
export async function getGroupMessages(groupId: string, limit = 100): Promise<GroupMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('group_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as GroupMessage[]).slice().reverse();
}

// Send a message (text or sticker). Returns the inserted row so the sender can
// append optimistically; realtime then mirrors it to everyone else.
export async function sendGroupMessage(
  groupId: string, userId: string, kind: 'text' | 'sticker', body: string,
  authorName?: string, authorAvatar?: string,
): Promise<GroupMessage | null> {
  if (!supabase) return null;
  const trimmed = body.trim().slice(0, 2000);
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('group_messages')
    .insert({ group_id: groupId, user_id: userId, kind, body: trimmed, author_name: authorName, author_avatar: authorAvatar })
    .select()
    .single();
  if (error) { console.error('[supabase/sendGroupMessage]', error); return null; }
  return data as GroupMessage;
}

export async function deleteGroupMessage(messageId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('group_messages').delete().eq('id', messageId);
}

// Live subscription to new messages in a group. Calls `onInsert` for every new
// row (including the sender's own — the UI dedupes by id). Returns an unsubscribe
// function; a no-op when Supabase isn't configured.
export function subscribeGroupMessages(groupId: string, onInsert: (m: GroupMessage) => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`group_messages:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      payload => onInsert(payload.new as GroupMessage),
    )
    .subscribe();
  return () => { try { supabase?.removeChannel(channel); } catch { /* already gone */ } };
}

// ── GDPR: data access & erasure (Art. 15, 17, 20) ─────────────────────────────

// Right of access / portability: assemble everything we hold about the user into
// a single machine-readable object the UI can download as JSON.
export async function exportMyData(userId: string): Promise<Record<string, unknown>> {
  if (!supabase) return { error: 'sync_disabled' };
  const [profile, following, followers, interactions, groups] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single().then(r => r.data),
    supabase.from('follows').select('following_id, created_at').eq('follower_id', userId).then(r => r.data ?? []),
    supabase.from('follows').select('follower_id, created_at').eq('following_id', userId).then(r => r.data ?? []),
    supabase.from('post_interactions').select('*').eq('user_id', userId).then(r => r.data ?? []),
    supabase.from('group_members').select('group_id, joined_at, groups(*)').eq('user_id', userId).then(r => r.data ?? []),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    userId,
    profile,
    following,
    followers,
    interactions,
    groups,
  };
}

// Right to erasure: delete all rows the user owns. Returns true if it ran.
// NOTE: this removes APP data via the user's own (RLS-guarded) session. Deleting
// the underlying auth.users record requires the service role and is done by
// POST /api/account/delete (which also signs the user out).
export async function deleteMyAppData(userId: string): Promise<boolean> {
  if (!supabase) return false;
  await Promise.allSettled([
    supabase.from('post_interactions').delete().eq('user_id', userId),
    supabase.from('follows').delete().eq('follower_id', userId),
    supabase.from('follows').delete().eq('following_id', userId),
    supabase.from('group_members').delete().eq('user_id', userId),
    supabase.from('group_events').delete().eq('added_by', userId),
    supabase.from('group_event_comments').delete().eq('user_id', userId),
    supabase.from('group_messages').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('id', userId),
  ]);
  return true;
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
