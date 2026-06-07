-- Fix: allow authenticated users to find a group by its invite code
-- Without this policy, joinGroup() returns null for every user because the RLS
-- check on the groups table blocks SELECT until you are already a member.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > Run

create policy "Authenticated users can discover groups"
  on groups
  for select
  using (auth.uid() is not null);
