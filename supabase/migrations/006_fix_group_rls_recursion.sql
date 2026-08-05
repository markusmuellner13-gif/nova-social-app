-- Fix: infinite recursion in the group row-level-security policies (SQLSTATE 42P17).
--
-- The SELECT policy on group_members read group_members:
--
--   using (exists (select 1 from group_members gm
--                  where gm.group_id = group_members.group_id
--                    and gm.user_id  = auth.uid()))
--
-- Evaluating that subquery re-applies the same policy to the same table, so
-- Postgres aborts with "infinite recursion detected in policy for relation
-- group_members" before returning a single row.
--
-- It did not stop at group_members. Every other group table asks the same
-- question ("is the caller a member?") by selecting from group_members, so the
-- recursion propagated: groups, group_members, group_events,
-- group_event_comments and group_messages ALL raised 42P17 for any signed-in
-- user. Measured against production before this migration -- five out of five.
--
-- `groups` failed too, even though it also had a permissive "any authenticated
-- user" policy. Permissive policies are OR'd, but Postgres still EVALUATES both
-- sides, and the recursive one raises rather than returning false. An error is
-- not a false. So the whole Groups feature was down, not degraded.
--
-- The fix is the standard one: ask the membership question inside a SECURITY
-- DEFINER function. The function is owned by the migration role, so its own read
-- of group_members runs as the owner and skips RLS -- no policy, no recursion.

-- ---------------------------------------------------------------------------
-- 1. The membership predicate, evaluated without RLS.
-- ---------------------------------------------------------------------------

-- STABLE so the planner may call it once per group_id rather than once per row.
-- `search_path = ''` is required on SECURITY DEFINER functions: without it a
-- caller can prepend a schema of their own and shadow `group_members` with a
-- table they control. Everything below is therefore schema-qualified.
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

comment on function public.is_group_member(uuid) is
  'True when the calling user belongs to the group. SECURITY DEFINER so RLS policies can ask about group_members without recursing into its own policy.';

-- It only ever discloses whether THE CALLER is a member, so it is safe to expose
-- broadly. anon needs it as well: a signed-out reader must get an empty result
-- from these tables, and a missing EXECUTE grant would raise instead.
grant execute on function public.is_group_member(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. group_members -- the actual recursion.
-- ---------------------------------------------------------------------------

drop policy if exists "Members can view other members" on public.group_members;
create policy "Members can view other members"
  on public.group_members for select
  using (
    -- Your own membership rows are always visible, which also lets a user list
    -- their groups before any other policy has an opinion.
    user_id = (select auth.uid())
    or public.is_group_member(group_id)
  );

-- ---------------------------------------------------------------------------
-- 3. groups -- and the invite-code leak.
-- ---------------------------------------------------------------------------

-- 001 added a blanket "any signed-in user can select groups" policy so that
-- joinGroup() could look a group up by its invite code before the caller was a
-- member. It worked, but it published every group in the database -- name,
-- description and, worst of all, `code` -- to every signed-in user. Anyone could
-- read the codes and walk into any group's chat and plans.
--
-- Lookup-by-code moves into the SECURITY DEFINER function in section 6, which
-- resolves exactly one group and only when the caller already knows its code.
drop policy if exists "Authenticated users can discover groups" on public.groups;

drop policy if exists "Group members can view group" on public.groups;
create policy "Group members can view group"
  on public.groups for select
  using (
    -- createGroup() inserts and reads the row back in one statement
    -- (INSERT ... RETURNING), and the creator is not a member yet at that
    -- instant -- the auto-join is a second statement. Without this arm, RLS
    -- filters the returned row and creating a group fails on `.single()`.
    created_by = (select auth.uid())
    or public.is_group_member(id)
  );

-- ---------------------------------------------------------------------------
-- 4. group_events / group_event_comments / group_messages.
-- ---------------------------------------------------------------------------
-- These were not self-recursive, but they inherited the fault by selecting from
-- group_members. Routing them through the function fixes them and drops a
-- correlated subquery per row.

drop policy if exists "Members can view group events" on public.group_events;
create policy "Members can view group events"
  on public.group_events for select
  using (public.is_group_member(group_id));

drop policy if exists "Members can add events" on public.group_events;
create policy "Members can add events"
  on public.group_events for insert
  with check (
    (select auth.uid()) = added_by
    and public.is_group_member(group_id)
  );

drop policy if exists "Group members can read event comments" on public.group_event_comments;
create policy "Group members can read event comments"
  on public.group_event_comments for select
  using (public.is_group_member(group_id));

drop policy if exists "Group members can post event comments" on public.group_event_comments;
create policy "Group members can post event comments"
  on public.group_event_comments for insert
  with check (
    (select auth.uid()) = user_id
    and public.is_group_member(group_id)
  );

drop policy if exists "Group members can read messages" on public.group_messages;
create policy "Group members can read messages"
  on public.group_messages for select
  using (public.is_group_member(group_id));

drop policy if exists "Group members can send messages" on public.group_messages;
create policy "Group members can send messages"
  on public.group_messages for insert
  with check (
    (select auth.uid()) = user_id
    and public.is_group_member(group_id)
  );

-- ---------------------------------------------------------------------------
-- 5. UPDATE on group_members, so a join can be an upsert.
-- ---------------------------------------------------------------------------
-- joinGroup() upserts. With only INSERT and DELETE policies, re-joining a group
-- you are already in fails the ON CONFLICT ... DO UPDATE arm.
drop policy if exists "Users can update own membership" on public.group_members;
create policy "Users can update own membership"
  on public.group_members for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 6. Joining by invite code, without publishing the codes.
-- ---------------------------------------------------------------------------
-- Resolves a group from a code the caller already holds and joins them to it, in
-- one statement. SECURITY DEFINER so the lookup can see a group the caller is
-- not yet a member of -- the one thing the dropped policy was there to allow --
-- while still revealing nothing about any group whose code you do not have.
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

comment on function public.join_group_by_code(text) is
  'Resolve a group by invite code and join the caller to it. SECURITY DEFINER so the lookup works before membership exists, without exposing every group to every user.';

-- Requires a real signed-in user; anon has nothing to gain from it.
revoke execute on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Index supporting the membership lookup.
-- ---------------------------------------------------------------------------
-- is_group_member filters on (group_id, user_id). The primary key already leads
-- with group_id, so the existing PK serves it; idx_group_members_user_id (from
-- schema.sql) serves the "my groups" direction. Nothing to add -- noted so the
-- next reader does not go looking.
