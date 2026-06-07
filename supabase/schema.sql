-- Nova App — Supabase Database Schema
-- Run this entire file in your Supabase project:
-- Dashboard > SQL Editor > New query > paste > Run

-- ── User profiles ────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  username     text unique not null,
  display_name text not null,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now()
);
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile"            on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"            on profiles for update using (auth.uid() = id);

-- ── Follows ──────────────────────────────────────────────────────────────────
create table if not exists follows (
  follower_id  uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);
alter table follows enable row level security;
create policy "Anyone can view follows"    on follows for select using (true);
create policy "Users manage own follows"   on follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow"         on follows for delete using (auth.uid() = follower_id);

-- ── Groups ───────────────────────────────────────────────────────────────────
create table if not exists groups (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  description text,
  code        text unique not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);
alter table groups enable row level security;
create policy "Group members can view"     on groups for select using (
  exists (select 1 from group_members where group_id = groups.id and user_id = auth.uid())
);
create policy "Authenticated users can create groups" on groups for insert with check (auth.uid() is not null);

create table if not exists group_members (
  group_id   uuid references groups(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  joined_at  timestamptz default now(),
  primary key (group_id, user_id)
);
alter table group_members enable row level security;
create policy "Members can view group members"  on group_members for select using (
  exists (select 1 from group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
);
create policy "Users can join groups"           on group_members for insert with check (auth.uid() = user_id);
create policy "Users can leave groups"          on group_members for delete using (auth.uid() = user_id);

-- ── Group events ─────────────────────────────────────────────────────────────
create table if not exists group_events (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references groups(id) on delete cascade,
  added_by   uuid references profiles(id) on delete set null,
  post_id    text not null,
  post_data  jsonb not null,
  created_at timestamptz default now(),
  unique (group_id, post_id)
);
alter table group_events enable row level security;
create policy "Group members can view events" on group_events for select using (
  exists (select 1 from group_members where group_id = group_events.group_id and user_id = auth.uid())
);
create policy "Group members can add events"  on group_events for insert with check (
  auth.uid() = added_by and
  exists (select 1 from group_members where group_id = group_events.group_id and user_id = auth.uid())
);
create policy "Adder can remove events"       on group_events for delete using (auth.uid() = added_by);
