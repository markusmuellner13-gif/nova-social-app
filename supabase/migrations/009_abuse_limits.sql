-- ─────────────────────────────────────────────────────────────────────────────
-- 009 — Abuse limits inside the database.
--
-- WHY: Nova's rate limiter (middleware.ts) only sees requests to Nova's own
-- /api/* routes. Supabase's REST API (PostgREST) is reachable directly with the
-- public anon key that ships in every copy of the app, so a single signed-in
-- account could write to these tables as fast as the network allows — growing
-- the free-plan database (500 MB) until it stops accepting writes, i.e. the app
-- breaks for everyone. Limits that must hold no matter who calls have to live
-- here, next to the data.
--
-- What this does:
--   1. surge_scores: drop the policy that let ANYONE (even logged out) insert.
--      Nothing in the app reads or writes this table.
--   2. Length / size CHECKs on every user-written text and JSON column, matching
--      the app's own form limits (CommentsSheet 1000, GroupChat 2000,
--      GroupEventChat 1000, GroupsTab name 80 / description 500).
--   3. A per-ACCOUNT write rate limit on every user-writable table, enforced by
--      a trigger. Server-side writes (service role, no auth.uid()) are exempt.
--   4. join_group_by_code / is_group_member: callable by signed-in users only.
--      (The trigger functions handle_new_user / prevent_username_change are left
--      as they are: Postgres refuses to run a trigger function outside a
--      trigger, so the advisor's "callable via RPC" warning for them is moot.)
--
-- Every table touched here was EMPTY when this was written (2026-10-05), so no
-- existing row can violate the new CHECKs.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── surge_scores: no anonymous inserts ────────────────────────────────────
drop policy if exists "surge_insert" on public.surge_scores;

-- 2 ── Size limits ────────────────────────────────────────────────────────────
-- display_name / author_name are generous (200): they are copied from the
-- OAuth provider at signup, and a CHECK that rejected a long real name would
-- fail the whole signup.
alter table public.post_comments
  add constraint post_comments_author_name_len   check (author_name   is null or char_length(author_name)   <= 200),
  add constraint post_comments_author_avatar_len check (author_avatar is null or char_length(author_avatar) <= 2048),
  add constraint post_comments_post_id_len       check (char_length(post_id) <= 512);

alter table public.group_messages
  add constraint group_messages_body_len          check (char_length(body) between 1 and 2000),
  add constraint group_messages_author_name_len   check (author_name   is null or char_length(author_name)   <= 200),
  add constraint group_messages_author_avatar_len check (author_avatar is null or char_length(author_avatar) <= 2048);

alter table public.group_event_comments
  add constraint group_event_comments_body_len          check (char_length(body) between 1 and 1000),
  add constraint group_event_comments_author_name_len   check (author_name   is null or char_length(author_name)   <= 200),
  add constraint group_event_comments_author_avatar_len check (author_avatar is null or char_length(author_avatar) <= 2048),
  add constraint group_event_comments_post_id_len       check (char_length(post_id) <= 512);

alter table public.groups
  add constraint groups_name_len        check (char_length(name) between 1 and 80),
  add constraint groups_description_len check (description is null or char_length(description) <= 500),
  add constraint groups_code_len        check (char_length(code) <= 16);

alter table public.profiles
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 200),
  add constraint profiles_bio_len          check (bio          is null or char_length(bio)          <= 500),
  add constraint profiles_avatar_url_len   check (avatar_url   is null or char_length(avatar_url)   <= 2048);

-- Post snapshots are a few KB (a post with its image list); 32 KB leaves
-- plenty of room while stopping a client from storing megabytes per row.
alter table public.post_interactions
  add constraint post_interactions_post_id_len   check (char_length(post_id) <= 512),
  add constraint post_interactions_post_data_len check (post_data is null or pg_column_size(post_data) <= 32768);

alter table public.group_events
  add constraint group_events_post_id_len   check (char_length(post_id) <= 512),
  add constraint group_events_post_data_len check (post_data is null or pg_column_size(post_data) <= 32768);

-- 3 ── Per-account write rate limit ───────────────────────────────────────────
-- Trigger arguments: (column holding the author's id, max per minute, max per
-- day). Counts the author's own rows created in the window — so it caps how
-- fast one account can GROW a table, which is what threatens the database.
--
-- SECURITY DEFINER so the count sees all of the author's rows regardless of
-- RLS (e.g. messages in a group they have since left); search_path '' so
-- nothing in the caller's path can be substituted into it.
create or replace function public.enforce_user_write_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  col     text := tg_argv[0];
  per_min int  := tg_argv[1]::int;
  per_day int  := tg_argv[2]::int;
  n_min   int;
  n_day   int;
begin
  -- Server-side writes (service role / cron / migrations) carry no user.
  if uid is null then
    return new;
  end if;

  -- The client must not choose its own timestamp: a row back-dated a week
  -- would never be counted by the windows below.
  new := jsonb_populate_record(new, jsonb_build_object('created_at', now()));

  execute format(
    'select count(*) filter (where created_at > now() - interval ''1 minute''), count(*)
       from %I.%I
      where %I = $1 and created_at > now() - interval ''1 day''',
    tg_table_schema, tg_table_name, col)
  into n_min, n_day
  using uid;

  if n_min >= per_min or n_day >= per_day then
    raise exception 'Too many changes in a short time. Please slow down and try again later.'
      using errcode = 'P0001', hint = 'nova_rate_limit';
  end if;
  return new;
end;
$$;

-- Indexes so each check is an index range scan, not a table scan.
create index if not exists post_comments_user_created_idx        on public.post_comments        (user_id, created_at);
create index if not exists group_messages_user_created_idx       on public.group_messages       (user_id, created_at);
create index if not exists group_event_comments_user_created_idx on public.group_event_comments (user_id, created_at);
create index if not exists group_events_adder_created_idx        on public.group_events         (added_by, created_at);
create index if not exists groups_creator_created_idx            on public.groups               (created_by, created_at);
create index if not exists follows_follower_created_idx          on public.follows              (follower_id, created_at);
create index if not exists post_interactions_user_created_idx    on public.post_interactions    (user_id, created_at);

-- Limits are far above what a person does by hand, and far below what a script
-- would need to do damage.
drop trigger if exists rate_limit_post_comments on public.post_comments;
create trigger rate_limit_post_comments before insert on public.post_comments
  for each row execute function public.enforce_user_write_rate('user_id', '10', '300');

drop trigger if exists rate_limit_group_messages on public.group_messages;
create trigger rate_limit_group_messages before insert on public.group_messages
  for each row execute function public.enforce_user_write_rate('user_id', '30', '2000');

drop trigger if exists rate_limit_group_event_comments on public.group_event_comments;
create trigger rate_limit_group_event_comments before insert on public.group_event_comments
  for each row execute function public.enforce_user_write_rate('user_id', '15', '500');

drop trigger if exists rate_limit_group_events on public.group_events;
create trigger rate_limit_group_events before insert on public.group_events
  for each row execute function public.enforce_user_write_rate('added_by', '30', '500');

drop trigger if exists rate_limit_groups on public.groups;
create trigger rate_limit_groups before insert on public.groups
  for each row execute function public.enforce_user_write_rate('created_by', '3', '20');

drop trigger if exists rate_limit_follows on public.follows;
create trigger rate_limit_follows before insert on public.follows
  for each row execute function public.enforce_user_write_rate('follower_id', '60', '1000');

drop trigger if exists rate_limit_post_interactions on public.post_interactions;
create trigger rate_limit_post_interactions before insert on public.post_interactions
  for each row execute function public.enforce_user_write_rate('user_id', '120', '5000');

-- 4 ── Group functions: signed-in users only ─────────────────────────────────
-- Every call in the app is made with a user session. Functions are executable
-- by PUBLIC by default, so revoke that and grant back only what is needed.
revoke execute on function public.join_group_by_code(text) from public, anon;
grant  execute on function public.join_group_by_code(text) to authenticated;

revoke execute on function public.is_group_member(uuid) from public, anon;
grant  execute on function public.is_group_member(uuid) to authenticated;
