-- Journal: private by default. Enforced here, not just hidden in the app.
--
-- records.tbl = 'journal'  one row per entry. data has ownerMemberId, shareWith (member ids), shareParents (bool)
-- records.tbl = 'policy'   one row per child (rid = the child's member id). data.parentsRead = parents may read this child's journal
--
-- Who can READ an entry:
--   * its author (the account linked to ownerMemberId)
--   * anyone named in shareWith
--   * a parent/owner account when the entry has shareParents = true
--   * a parent/owner account when a parent switched on "parentsRead" for that child AND the child is under 15
-- Only the author can write, change or delete an entry. A deleted entry is only an empty marker, so readers' devices can clear it.
-- Everything else (events, chores, meds, ...) keeps exactly the rules from migration 003.

create or replace function public.is_family_parent(fid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.family_members m
    where m.family_id = fid and m.user_id = (select auth.uid()) and m.status = 'approved' and m.role in ('owner', 'parent'))
$$;

create or replace function public.journal_owner(p_data jsonb)
returns bigint language sql immutable set search_path = '' as $$
  select case when p_data ->> 'ownerMemberId' ~ '^[0-9]+$' then (p_data ->> 'ownerMemberId')::bigint end
$$;

create or replace function public.journal_can_write(fid uuid, p_data jsonb)
returns boolean language sql security definer stable set search_path = '' as $$
  select p_data is not null and public.my_member_id(fid) is not null and public.journal_owner(p_data) = public.my_member_id(fid)
$$;

create or replace function public.journal_can_read(fid uuid, p_data jsonb)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare
  me bigint := public.my_member_id(fid);
  owner bigint := public.journal_owner(p_data);
  mrow jsonb;
begin
  if p_data is null or owner is null then return false; end if;
  if me is not null and owner = me then return true; end if;
  if me is not null and coalesce(p_data -> 'shareWith', '[]'::jsonb) @> to_jsonb(me) then return true; end if;
  if public.is_family_parent(fid) then
    if p_data -> 'shareParents' = 'true'::jsonb then return true; end if;
    -- a parent override only reaches children under 15
    select r.data into mrow from public.records r where r.family_id = fid and r.tbl = 'members' and r.rid = owner::text and not r.deleted;
    if mrow is not null and mrow ->> 'role' = 'child' and coalesce((mrow ->> 'age')::numeric, 0) < 15
       and exists (select 1 from public.records p where p.family_id = fid and p.tbl = 'policy' and p.rid = owner::text and not p.deleted and p.data -> 'parentsRead' = 'true'::jsonb)
    then return true; end if;
  end if;
  return false;
end $$;

revoke execute on function public.is_family_parent(uuid), public.journal_owner(jsonb), public.journal_can_write(uuid, jsonb), public.journal_can_read(uuid, jsonb) from public, anon;
grant execute on function public.is_family_parent(uuid), public.journal_owner(jsonb), public.journal_can_write(uuid, jsonb), public.journal_can_read(uuid, jsonb) to authenticated;

drop policy if exists "read records" on public.records;
drop policy if exists "insert records" on public.records;
drop policy if exists "update records" on public.records;
drop policy if exists "delete records" on public.records;

create policy "read records" on public.records for select to authenticated
  using (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then (deleted or public.journal_can_read(family_id, data))
      when 'policy' then true
      else (public.is_family_full(family_id) or public.limited_can_see(family_id, tbl, data))
    end));

create policy "insert records" on public.records for insert to authenticated
  with check (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then (public.journal_can_write(family_id, data) or (deleted and data is null))
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end));

create policy "update records" on public.records for update to authenticated
  using (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then public.journal_can_write(family_id, data)
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end))
  with check (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then (public.journal_can_write(family_id, data) or (deleted and data is null))
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end));

create policy "delete records" on public.records for delete to authenticated
  using (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then public.journal_can_write(family_id, data)
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end));
