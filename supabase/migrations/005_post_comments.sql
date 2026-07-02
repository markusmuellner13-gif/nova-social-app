-- Real per-post comments (replaces the old local-only comment sheet).
-- post_id is the feed post's string id (events are ephemeral API content, so
-- there's no posts table to reference — same convention as post_interactions).

create table if not exists public.post_comments (
  id            uuid primary key default uuid_generate_v4(),
  post_id       text not null,
  user_id       uuid not null references auth.users on delete cascade,
  author_name   text,
  author_avatar text,
  body          text not null check (char_length(body) between 1 and 1000),
  created_at    timestamptz default now()
);

create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

create policy "Anyone can read comments"
  on public.post_comments for select using (true);

create policy "Signed-in users comment as themselves"
  on public.post_comments for insert with check (auth.uid() = user_id);

create policy "Authors can delete their own comments"
  on public.post_comments for delete using (auth.uid() = user_id);
