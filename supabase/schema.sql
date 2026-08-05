-- Nova App — Supabase Database Schema
-- Run this entire file in your Supabase project:
-- Dashboard > SQL Editor > New query > paste > Run

-- ── Step 1: Create all tables first ─────────────────────────────────────────

create table if not exists profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  username     text unique not null,
  display_name text not null,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now()
);

create table if not exists follows (
  follower_id  uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

create table if not exists groups (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  description text,
  code        text unique not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists group_members (
  group_id   uuid references groups(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  joined_at  timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists group_events (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references groups(id) on delete cascade,
  added_by   uuid references profiles(id) on delete set null,
  post_id    text not null,
  post_data  jsonb not null,
  created_at timestamptz default now(),
  unique (group_id, post_id)
);

create table if not exists post_interactions (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id) on delete cascade,
  post_id          text not null,
  interaction_type text not null check (interaction_type in ('like', 'save', 'going')),
  post_data        jsonb,
  created_at       timestamptz default now(),
  unique (user_id, post_id, interaction_type)
);

-- ── Step 2: Enable RLS on all tables ────────────────────────────────────────

alter table profiles          enable row level security;
alter table follows           enable row level security;
alter table groups            enable row level security;
alter table group_members     enable row level security;
alter table post_interactions enable row level security;
alter table group_events  enable row level security;

-- ── Step 3: Membership predicate (must exist before the policies use it) ─────

-- Every group policy needs to ask "is the caller a member of this group?", which
-- means reading group_members. Asking that INSIDE a policy on group_members is
-- infinite recursion (Postgres 42P17), and because the other group tables asked
-- it too, the recursion took all of them down. SECURITY DEFINER runs the lookup
-- as the function owner, which is exempt from RLS — so the question can be asked
-- without re-entering the policy. See migrations/006_fix_group_rls_recursion.sql.
--
-- `search_path = ''` is mandatory here: without it a caller could shadow
-- `group_members` with their own table. Hence the schema qualification below.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id  = auth.uid()
  );
$$;

grant execute on function public.is_group_member(uuid) to anon, authenticated, service_role;

-- Joining by invite code needs to read a group you are NOT yet a member of. Doing
-- that from the client required a policy exposing every group (and every invite
-- code) to every signed-in user. This resolves only the group whose code the
-- caller already has, and joins them in the same statement.
create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_group
  from public.groups
  where code = upper(btrim(p_code));

  if not found then
    return null;
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group.id, v_uid)
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

revoke execute on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated, service_role;

-- ── Step 4: Add all policies (all tables now exist) ──────────────────────────

-- profiles
create policy "Profiles are public"          on profiles for select using (true);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- follows
create policy "Follows are public"           on follows for select using (true);
create policy "Users can follow"             on follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow"           on follows for delete using (auth.uid() = follower_id);

-- groups
-- `created_by` is checked first because createGroup() does INSERT ... RETURNING:
-- at that instant the creator is not a member yet (the auto-join is the next
-- statement), so a membership-only rule would filter out the row it just wrote.
create policy "Group members can view group" on groups for select using (
  created_by = (select auth.uid()) or public.is_group_member(id)
);
create policy "Auth users can create groups" on groups for insert with check (auth.uid() is not null);

-- group_members
create policy "Members can view other members" on group_members for select using (
  user_id = (select auth.uid()) or public.is_group_member(group_id)
);
create policy "Users can join groups"          on group_members for insert with check (auth.uid() = user_id);
create policy "Users can leave groups"         on group_members for delete using (auth.uid() = user_id);
-- joinGroup() upserts, and the ON CONFLICT DO UPDATE arm needs an UPDATE policy.
create policy "Users can update own membership" on group_members for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- group_events
create policy "Members can view group events" on group_events for select using (
  public.is_group_member(group_id)
);
create policy "Members can add events"        on group_events for insert with check (
  (select auth.uid()) = added_by and public.is_group_member(group_id)
);
create policy "Adder can remove events"       on group_events for delete using (auth.uid() = added_by);

-- post_interactions
create policy "Users can view own interactions"   on post_interactions for select using (auth.uid() = user_id);
create policy "Users can insert own interactions" on post_interactions for insert with check (auth.uid() = user_id);
create policy "Users can delete own interactions" on post_interactions for delete using (auth.uid() = user_id);
create policy "Users can update own interactions" on post_interactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Step 4: Indexes for query performance at scale ───────────────────────────

create index if not exists idx_post_interactions_user_id on post_interactions(user_id);
create index if not exists idx_post_interactions_post_id on post_interactions(post_id);
create index if not exists idx_follows_follower_id       on follows(follower_id);
create index if not exists idx_follows_following_id      on follows(following_id);
create index if not exists idx_group_members_group_id    on group_members(group_id);
create index if not exists idx_group_members_user_id     on group_members(user_id);
create index if not exists idx_group_events_group_id     on group_events(group_id);
create index if not exists idx_profiles_username         on profiles(username);
