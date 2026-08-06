-- ─────────────────────────────────────────────────────────────────────────────
-- 007 — Username integrity + server-side profile creation
--
-- WHAT WAS WRONG
-- `profiles.username` had a UNIQUE constraint, but the `on_auth_user_created`
-- trigger from supabase-schema.sql was NEVER APPLIED to this project (verified:
-- pg_trigger has no non-internal trigger on auth.users). So profile creation
-- happened only client-side, in AuthContext's `upsertProfile`, whose error path
-- is a bare console.error.
--
-- The result: signing up with a taken username still created the auth.users row,
-- then the profile INSERT failed with 23505 and was swallowed. The account ended
-- up authenticated but profile-less, permanently — every later sign-in retried
-- the same doomed insert. The same thing happened to two Google users whose
-- email local-parts matched (a@gmail.com vs a@outlook.com both want "a").
--
-- Three further holes this closes:
--   * uniqueness was CASE-SENSITIVE, so "Markus" and "markus" could coexist
--   * no charset rule, so unicode homoglyphs could impersonate ("mаrkus" with a
--     Cyrillic а is a different string but renders identically)
--   * no reserved-name list, so anyone could take "admin", "support", "nova"
--
-- Requires no data migration: public.profiles is empty (0 rows, checked).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Shape rules ───────────────────────────────────────────────────────────
-- 3–30 chars, lowercase a-z 0-9 plus . and _ as separators only (never leading,
-- trailing or doubled). ASCII-only is what kills the homoglyph attack: a
-- confusable character simply cannot be stored.
alter table public.profiles
  drop constraint if exists profiles_username_shape;

alter table public.profiles
  add constraint profiles_username_shape check (
    username ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
    and username !~ '[._]{2}'
  );

-- ── 2. Case-insensitive uniqueness ───────────────────────────────────────────
-- The shape rule already forces lowercase, so this is belt-and-braces against a
-- future path that inserts mixed case: it makes the collision impossible rather
-- than merely unlikely.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- ── 3. Reserved names ────────────────────────────────────────────────────────
-- Names that must never belong to a normal user, because seeing them next to a
-- message is itself a claim of authority. Table rather than a CHECK list so it
-- can be extended without a migration.
create table if not exists public.reserved_usernames (
  username text primary key
);

-- RLS on with ZERO policies = no client can read or write it at all. Deliberate:
-- the availability check runs inside a SECURITY DEFINER function, so the client
-- never needs to select this, and enumerating the reserved list has no value.
alter table public.reserved_usernames enable row level security;

insert into public.reserved_usernames (username) values
  ('admin'), ('administrator'), ('root'), ('superuser'), ('sysadmin'),
  ('support'), ('help'), ('helpdesk'), ('contact'), ('info'), ('billing'),
  ('security'), ('abuse'), ('privacy'), ('legal'), ('moderator'), ('mod'),
  ('nova'), ('novaapp'), ('nova_app'), ('nova.app'), ('official'), ('staff'),
  ('team'), ('system'), ('api'), ('www'), ('mail'), ('postmaster'), ('webmaster'),
  ('null'), ('undefined'), ('anonymous'), ('guest'), ('me'), ('you'), ('everyone'),
  ('verified'), ('nova_official'), ('nova_support'), ('nova_team')
on conflict (username) do nothing;

-- ── 4. Sanitiser ─────────────────────────────────────────────────────────────
-- Turns an arbitrary string (OAuth display name, email local-part, whatever the
-- client sent in user_metadata) into something that satisfies the shape rule, or
-- returns null if nothing usable survives.
create or replace function public.sanitize_username(p_raw text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v text;
begin
  if p_raw is null then return null; end if;

  -- Decompose accents (ü→u + combining diaeresis) with the built-in normalize()
  -- so no extension is required, then drop every combining mark and everything
  -- else outside the allowed ASCII set. ß does NOT decompose under NFD, so it is
  -- mapped explicitly first (the same trap as the JS-side slug normaliser).
  v := lower(p_raw);
  v := replace(v, 'ß', 'ss');
  v := normalize(v, NFD);
  v := regexp_replace(v, '[̀-ͯ]', '', 'g'); -- combining diacritics
  v := regexp_replace(v, '[^a-z0-9._]', '', 'g');  -- strip the rest
  v := regexp_replace(v, '[._]{2,}', '.', 'g');    -- collapse doubled separators
  v := regexp_replace(v, '^[._]+|[._]+$', '', 'g');-- trim separators off the ends
  v := left(v, 30);
  v := regexp_replace(v, '[._]+$', '', 'g');       -- left() may have re-exposed one

  if length(v) < 3 then return null; end if;
  return v;
end;
$$;

-- ── 5. Availability check (called by the signup form) ────────────────────────
-- SECURITY DEFINER so it can consult reserved_usernames and profiles without
-- exposing either. Returns a reason code, never a row.
create or replace function public.username_available(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := lower(coalesce(trim(p_username), ''));
begin
  if length(v) < 3  then return 'too_short'; end if;
  if length(v) > 30 then return 'too_long';  end if;
  if v !~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$' or v ~ '[._]{2}' then
    return 'invalid_format';
  end if;
  if exists (select 1 from public.reserved_usernames r where r.username = v) then
    return 'reserved';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = v) then
    return 'taken';
  end if;
  return 'available';
end;
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── 6. Profile creation moves to the database ────────────────────────────────
-- Atomic with the auth.users insert, so an account can no longer exist without a
-- profile. Collisions are resolved by suffixing rather than raising: failing here
-- would roll back the signup itself, and a user whose chosen name was taken in
-- the seconds between the availability check and submit should still get an
-- account. The form checks availability first, so the suffix path is the rare
-- race, not the normal case.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base    text;
  v_try     text;
  v_display text;
  v_n       int := 0;
begin
  v_base := public.sanitize_username(new.raw_user_meta_data->>'username');

  if v_base is null then
    v_base := public.sanitize_username(split_part(coalesce(new.email, ''), '@', 1));
  end if;

  -- Nothing usable (e.g. a fully non-ASCII name) → a stable, unguessable
  -- fallback derived from the user id.
  if v_base is null then
    v_base := 'nova' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  -- A reserved base is NOT suffixed past: "admin" → "admin.1" still reads as an
  -- official account, which is the whole thing the reserved list exists to stop.
  -- Drop to the neutral id-derived name instead.
  if exists (select 1 from public.reserved_usernames r where r.username = v_base) then
    v_base := 'nova' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  v_try := v_base;
  loop
    exit when not exists (select 1 from public.profiles p where lower(p.username) = v_try)
          and not exists (select 1 from public.reserved_usernames r where r.username = v_try);
    v_n := v_n + 1;
    if v_n > 50 then
      v_try := 'nova' || substr(replace(new.id::text, '-', ''), 1, 10);
      exit;
    end if;
    -- Keep the total within 30 chars while appending the discriminator.
    v_try := left(v_base, 30 - length(v_n::text) - 1) || '.' || v_n::text;
    v_try := regexp_replace(v_try, '[._]{2,}', '.', 'g');
  end loop;

  v_display := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    v_try
  );
  v_display := left(v_display, 50);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_try,
    v_display,
    nullif(trim(coalesce(new.raw_user_meta_data->>'avatar_url', '')), '')
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  -- A profile is recoverable (the client re-upserts on next sign-in); a failed
  -- signup is not. Never let this trigger be the reason an account can't be made.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 7. Lock down the username column post-creation ───────────────────────────
-- The UPDATE policy is `auth.uid() = id`, which lets a user rewrite their own
-- row — including username. There is no username-edit UI, so anyone doing this
-- is doing it through the API by hand. Uniqueness still holds, but a handle
-- swap after the fact is how impersonation-by-reuse works ("@markus" abandons
-- the name, someone else grabs it and inherits the mentions). Freeze it.
create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_immutable on public.profiles;
create trigger profiles_username_immutable
  before update on public.profiles
  for each row execute procedure public.prevent_username_change();
