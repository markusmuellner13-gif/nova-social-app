-- Group event discussion threads — chat/comments on a shared group event so the
-- group can plan together (where to meet, who's driving, which night) instead of
-- only RSVPing. Run this in the Supabase SQL editor (Dashboard → SQL Editor).
--
-- The app degrades gracefully without this table: the discussion sheet shows an
-- empty state and posting is a no-op until the migration is applied.

create table if not exists public.group_event_comments (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references public.groups on delete cascade,
  post_id       text not null,
  user_id       uuid not null references public.profiles on delete cascade,
  author_name   text,
  author_avatar text,
  body          text not null,
  created_at    timestamptz default now()
);

alter table public.group_event_comments enable row level security;

-- Only members of the group can read its discussion.
create policy "Group members can read event comments"
  on public.group_event_comments for select
  using (exists (
    select 1 from public.group_members
    where group_id = group_event_comments.group_id and user_id = auth.uid()
  ));

-- Only members can post, and only as themselves.
create policy "Group members can post event comments"
  on public.group_event_comments for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.group_members
      where group_id = group_event_comments.group_id and user_id = auth.uid()
    )
  );

-- Authors can delete their own messages.
create policy "Authors can delete their event comments"
  on public.group_event_comments for delete
  using (auth.uid() = user_id);

create index if not exists group_event_comments_thread_idx
  on public.group_event_comments (group_id, post_id, created_at);
