-- Nova — Supabase database schema
-- Run this in your Supabase SQL editor after creating your project.
-- Supabase Dashboard → SQL Editor → New query → paste + run.

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Profiles ─────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific profile data.
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text unique not null,
  display_name  text not null,
  avatar_url    text,
  bio           text default '',
  created_at    timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- ── Follows ───────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id   uuid not null references public.profiles on delete cascade,
  following_id  uuid not null references public.profiles on delete cascade,
  created_at    timestamptz default now(),
  primary key (follower_id, following_id)
);

alter table public.follows enable row level security;

create policy "Anyone can view follows" on public.follows for select using (true);
create policy "Users can follow"        on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow"      on public.follows for delete using (auth.uid() = follower_id);

-- ── Groups ────────────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text default '',
  code        text unique not null,
  created_by  uuid references public.profiles on delete set null,
  created_at  timestamptz default now()
);

alter table public.groups enable row level security;

create policy "Anyone can view groups" on public.groups for select using (true);
create policy "Auth users can create groups" on public.groups for insert with check (auth.uid() is not null);
create policy "Group creator can update" on public.groups for update using (auth.uid() = created_by);
create policy "Group creator can delete" on public.groups for delete using (auth.uid() = created_by);

-- ── Group Members ─────────────────────────────────────────────────────────────
create table if not exists public.group_members (
  group_id    uuid not null references public.groups on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  joined_at   timestamptz default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

create policy "Anyone can view members" on public.group_members for select using (true);
create policy "Users can join"          on public.group_members for insert with check (auth.uid() = user_id);
create policy "Users can leave"         on public.group_members for delete using (auth.uid() = user_id);

-- ── Group Events ──────────────────────────────────────────────────────────────
create table if not exists public.group_events (
  id          uuid primary key default uuid_generate_v4(),
  group_id    uuid not null references public.groups on delete cascade,
  added_by    uuid references public.profiles on delete set null,
  post_id     text not null,
  post_data   jsonb not null default '{}',
  adder_name  text,
  created_at  timestamptz default now(),
  unique (group_id, post_id)
);

alter table public.group_events enable row level security;

create policy "Group members can view events"
  on public.group_events for select
  using (exists (
    select 1 from public.group_members
    where group_id = group_events.group_id and user_id = auth.uid()
  ));

create policy "Group members can add events"
  on public.group_events for insert
  with check (
    auth.uid() is not null and
    exists (select 1 from public.group_members where group_id = group_events.group_id and user_id = auth.uid())
  );

create policy "Event adder can remove"
  on public.group_events for delete using (auth.uid() = added_by);

-- ── Auto-create profile on signup ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Post Interactions (likes, saves, going) ───────────────────────────────────
-- Persists per-user interactions across devices when signed in.
create table if not exists public.post_interactions (
  user_id          uuid not null references auth.users on delete cascade,
  post_id          text not null,
  interaction_type text not null check (interaction_type in ('like', 'save', 'going')),
  created_at       timestamptz default now(),
  primary key (user_id, post_id, interaction_type)
);

alter table public.post_interactions enable row level security;

create policy "Users manage own interactions"
  on public.post_interactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
