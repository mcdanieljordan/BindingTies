-- Join approval, roles, and account <-> person linking.
alter table public.family_members
  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved')),
  add column if not exists role text not null default 'parent' check (role in ('owner', 'parent', 'member')),
  add column if not exists member_id bigint;

-- only approved accounts count as family members for data access
create or replace function public.is_family_member(fid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.family_members m
    where m.family_id = fid and m.user_id = (select auth.uid()) and m.status = 'approved')
$$;

create or replace function public.is_family_parent(fid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.family_members m
    where m.family_id = fid and m.user_id = (select auth.uid()) and m.status = 'approved' and m.role in ('owner', 'parent'))
$$;

drop function if exists public.create_family(text, text);
drop function if exists public.join_family(text);

create or replace function public.membership_json(p_family uuid, p_user uuid)
returns jsonb language sql security definer stable set search_path = '' as $$
  select to_jsonb(x) from (
    select f.id, f.name, f.invite_code, f.tz, m.status, m.member_id, m.role
    from public.family_members m join public.families f on f.id = m.family_id
    where m.family_id = p_family and m.user_id = p_user) x
$$;
revoke execute on function public.membership_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_family(p_name text, p_tz text default 'America/Chicago')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.families (name, tz, invite_code, created_by)
    values (left(coalesce(nullif(trim(p_name), ''), 'Our family'), 60), coalesce(p_tz, 'America/Chicago'),
            upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)), (select auth.uid()))
    returning * into f;
  insert into public.family_members (family_id, user_id, status, role) values (f.id, (select auth.uid()), 'approved', 'owner');
  return public.membership_json(f.id, (select auth.uid()));
end $$;

-- joining only creates a REQUEST; a parent must approve it
create or replace function public.join_family(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select * into f from public.families where invite_code = upper(trim(p_code));
  if not found then raise exception 'That invite code was not found'; end if;
  insert into public.family_members (family_id, user_id, status, role) values (f.id, (select auth.uid()), 'pending', 'member')
    on conflict do nothing;
  return public.membership_json(f.id, (select auth.uid()));
end $$;

create or replace function public.my_membership()
returns jsonb language sql security definer stable set search_path = '' as $$
  select public.membership_json(m.family_id, m.user_id)
  from public.family_members m where m.user_id = (select auth.uid())
  order by (m.status = 'approved') desc, m.joined_at limit 1
$$;

create or replace function public.pending_requests(p_family uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'requested', m.joined_at) order by m.joined_at)
    from public.family_members m join auth.users u on u.id = m.user_id
    where m.family_id = p_family and m.status = 'pending'), '[]'::jsonb);
end $$;

create or replace function public.family_accounts(p_family uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_family_member(p_family) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'member_id', m.member_id, 'role', m.role) order by m.joined_at)
    from public.family_members m join auth.users u on u.id = m.user_id
    where m.family_id = p_family and m.status = 'approved'), '[]'::jsonb);
end $$;

create or replace function public.approve_member(p_family uuid, p_user uuid, p_member_id bigint, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can approve'; end if;
  update public.family_members set status = 'approved', member_id = p_member_id,
    role = case when p_role in ('parent', 'member') then p_role else 'member' end
  where family_id = p_family and user_id = p_user and status = 'pending';
end $$;

create or replace function public.deny_member(p_family uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can do this'; end if;
  delete from public.family_members where family_id = p_family and user_id = p_user and role <> 'owner';
end $$;

create or replace function public.link_member(p_family uuid, p_member_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.family_members set member_id = p_member_id
  where family_id = p_family and user_id = (select auth.uid()) and status = 'approved';
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'create_family(text,text)', 'join_family(text)', 'my_membership()', 'pending_requests(uuid)', 'family_accounts(uuid)',
    'approve_member(uuid,uuid,bigint,text)', 'deny_member(uuid,uuid)', 'link_member(uuid,bigint)', 'is_family_parent(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
