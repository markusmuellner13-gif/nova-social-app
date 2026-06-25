-- Group chat — a WhatsApp-style live message thread for everyone in a group,
-- separate from the per-event discussion (003). Supports text and stickers.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- The app degrades gracefully without this table: the Chat tab shows an empty
-- state and sending is a no-op until the migration is applied.

create table if not exists public.group_messages (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references public.groups on delete cascade,
  user_id       uuid not null references public.profiles on delete cascade,
  author_name   text,
  author_avatar text,
  kind          text not null default 'text' check (kind in ('text', 'sticker')),
  body          text not null default '',
  created_at    timestamptz default now()
);

alter table public.group_messages enable row level security;

-- Only members of the group can read its chat.
create policy "Group members can read messages"
  on public.group_messages for select
  using (exists (
    select 1 from public.group_members
    where group_id = group_messages.group_id and user_id = auth.uid()
  ));

-- Only members can send, and only as themselves.
create policy "Group members can send messages"
  on public.group_messages for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.group_members
      where group_id = group_messages.group_id and user_id = auth.uid()
    )
  );

-- Authors can delete their own messages.
create policy "Authors can delete their messages"
  on public.group_messages for delete
  using (auth.uid() = user_id);

create index if not exists group_messages_thread_idx
  on public.group_messages (group_id, created_at);

-- Live delivery: add the table to the realtime publication so members see new
-- messages instantly (WhatsApp-style) without polling. Guarded so re-running
-- the migration is safe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;
