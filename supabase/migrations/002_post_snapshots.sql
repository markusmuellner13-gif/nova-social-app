-- Multi-device sync of liked/saved/going posts.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Stores the full post snapshot (image, caption, venue, date, ticket link…)
-- with each interaction, so a post liked on one device can be displayed in
-- the profile tab of any other signed-in device. The app works without this
-- migration (it falls back to id-only sync), but cross-device display of
-- liked/saved posts requires it.

alter table public.post_interactions
  add column if not exists post_data jsonb;

-- Upserts update existing rows (e.g. re-saving a post refreshes its snapshot),
-- which requires an UPDATE policy under row level security.
drop policy if exists "Users can update own interactions" on public.post_interactions;
create policy "Users can update own interactions"
  on public.post_interactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
