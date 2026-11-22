-- Invites (personal links + email match) and Full / Limited family access.

alter table public.family_members
  add column if not exists access text not null default 'full' check (access in ('full', 'limited')),
  add column if not exists requested_access text not null default 'limited' check (requested_access in ('full', 'limited'));

-- ---------- invites ----------
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id bigint not null,
  email text,
  access text not null default 'limited' check (access in ('full', 'limited')),
  role text not null default 'member' check (role in ('parent', 'member')),
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists family_invites_family_idx on public.family_invites (family_id);
create index if not exists family_invites_email_idx on public.family_invites (lower(email));
alter table public.family_invites enable row level security; -- no policies: only the functions below touch it

-- ---------- helpers ----------
create or replace function public.my_member_id(fid uuid)
returns bigint language sql security definer stable set search_path = '' as $$
  select m.member_id from public.family_members m
  where m.family_id = fid and m.user_id = (select auth.uid()) and m.status = 'approved'
$$;

create or replace function public.is_family_full(fid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.family_members m
    where m.family_id = fid and m.user_id = (select auth.uid()) and m.status = 'approved'
      and (m.access = 'full' or m.role in ('owner', 'parent')))
$$;

-- what a Limited account may see/change, row by row
create or replace function public.limited_can_see(fid uuid, p_tbl text, p_data jsonb)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare me bigint := public.my_member_id(fid);
begin
  if p_tbl in ('members', 'ledger', 'rewards', 'chores', 'lists', 'listItems', 'timers', 'alarms', 'runs', 'kv', 'photos') then return true; end if;
  if p_data is null then return p_tbl in ('events', 'routines'); end if; -- deletions carry no data
  if p_tbl = 'events' then return me is not null and coalesce(p_data -> 'memberIds', '[]'::jsonb) @> to_jsonb(me); end if;
  if p_tbl = 'routines' then return me is not null and (p_data ->> 'memberId') = me::text; end if;
  return false; -- meds, doses, vault, goals and anything new stay hidden
end $$;

create or replace function public.limited_can_write(fid uuid, p_tbl text)
returns boolean language sql security definer stable set search_path = '' as $$
  select p_tbl in ('events', 'runs', 'ledger', 'chores', 'lists', 'listItems', 'timers', 'photos')
$$;

revoke execute on function public.my_member_id(uuid), public.is_family_full(uuid), public.limited_can_see(uuid, text, jsonb), public.limited_can_write(uuid, text) from public, anon;
grant execute on function public.my_member_id(uuid), public.is_family_full(uuid), public.limited_can_see(uuid, text, jsonb), public.limited_can_write(uuid, text) to authenticated;

-- ---------- records: Full sees everything, Limited only what is theirs ----------
drop policy if exists "members read records" on public.records;
drop policy if exists "members insert records" on public.records;
drop policy if exists "members update records" on public.records;
drop policy if exists "members delete records" on public.records;
create policy "read records" on public.records for select to authenticated
  using (public.is_family_member(family_id) and (public.is_family_full(family_id) or public.limited_can_see(family_id, tbl, data)));
create policy "insert records" on public.records for insert to authenticated
  with check (public.is_family_member(family_id) and (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl)));
create policy "update records" on public.records for update to authenticated
  using (public.is_family_member(family_id) and (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl)))
  with check (public.is_family_member(family_id) and (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl)));
create policy "delete records" on public.records for delete to authenticated
  using (public.is_family_member(family_id) and (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl)));

-- ---------- private files: Limited cannot open vault documents ----------
-- file paths look like <family>/<table>/<id>...; keep the vault folder to Full accounts
drop policy if exists "family files read" on storage.objects;
create policy "family files read" on storage.objects for select to authenticated
  using (bucket_id = 'family-files'
    and public.is_family_member(((storage.foldername(name))[1])::uuid)
    and (public.is_family_full(((storage.foldername(name))[1])::uuid) or coalesce((storage.foldername(name))[2], '') <> 'vault'));

-- ---------- membership payload now includes access ----------
create or replace function public.membership_json(p_family uuid, p_user uuid)
returns jsonb language sql security definer stable set search_path = '' as $$
  select to_jsonb(x) from (
    select f.id, f.name, f.invite_code, f.tz, m.status, m.member_id, m.role,
           case when m.role in ('owner', 'parent') then 'full' else m.access end as access
    from public.family_members m join public.families f on f.id = m.family_id
    where m.family_id = p_family and m.user_id = p_user) x
$$;
revoke execute on function public.membership_json(uuid, uuid) from public, anon, authenticated;

-- joining by code: say which kind of access you are asking for
drop function if exists public.join_family(text);
create or replace function public.join_family(p_code text, p_access text default 'limited')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select * into f from public.families where invite_code = upper(trim(p_code));
  if not found then raise exception 'That invite code was not found'; end if;
  insert into public.family_members (family_id, user_id, status, role, access, requested_access)
    values (f.id, (select auth.uid()), 'pending', 'member', 'limited', case when p_access = 'full' then 'full' else 'limited' end)
    on conflict do nothing;
  return public.membership_json(f.id, (select auth.uid()));
end $$;

drop function if exists public.pending_requests(uuid);
create or replace function public.pending_requests(p_family uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'requested', m.joined_at, 'requested_access', m.requested_access) order by m.joined_at)
    from public.family_members m join auth.users u on u.id = m.user_id
    where m.family_id = p_family and m.status = 'pending'), '[]'::jsonb);
end $$;

drop function if exists public.family_accounts(uuid);
create or replace function public.family_accounts(p_family uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_family_member(p_family) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'member_id', m.member_id, 'role', m.role,
      'access', case when m.role in ('owner', 'parent') then 'full' else m.access end) order by m.joined_at)
    from public.family_members m join auth.users u on u.id = m.user_id
    where m.family_id = p_family and m.status = 'approved'), '[]'::jsonb);
end $$;

drop function if exists public.approve_member(uuid, uuid, bigint, text);
create or replace function public.approve_member(p_family uuid, p_user uuid, p_member_id bigint, p_role text, p_access text default 'limited')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can approve'; end if;
  update public.family_members set status = 'approved', member_id = p_member_id,
    role = case when p_role in ('parent', 'member') then p_role else 'member' end,
    access = case when p_role = 'parent' or p_access = 'full' then 'full' else 'limited' end
  where family_id = p_family and user_id = p_user and status = 'pending';
end $$;

-- change an existing login's access later
create or replace function public.set_member_access(p_family uuid, p_user uuid, p_access text, p_role text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can do this'; end if;
  update public.family_members set
    role = case when p_role in ('parent', 'member') then p_role else role end,
    access = case when p_access = 'full' or p_role = 'parent' then 'full' else 'limited' end
  where family_id = p_family and user_id = p_user and role <> 'owner';
end $$;

-- ---------- invites API ----------
create or replace function public.create_invite(p_family uuid, p_member bigint, p_email text, p_access text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.family_invites; em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can invite'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address does not look right'; end if;
  -- one open invite per person: a new one replaces the old
  delete from public.family_invites where family_id = p_family and member_id = p_member and used_at is null;
  insert into public.family_invites (family_id, member_id, email, access, role)
    values (p_family, p_member, em, case when p_role = 'parent' or p_access = 'full' then 'full' else 'limited' end, case when p_role = 'parent' then 'parent' else 'member' end)
    returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'email', r.email, 'access', r.access, 'role', r.role, 'member_id', r.member_id);
end $$;

create or replace function public.list_invites(p_family uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'token', i.token, 'email', i.email, 'access', i.access, 'role', i.role, 'member_id', i.member_id, 'created_at', i.created_at) order by i.created_at)
    from public.family_invites i where i.family_id = p_family and i.used_at is null and i.expires_at > now()), '[]'::jsonb);
end $$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select family_id into fid from public.family_invites where id = p_invite;
  if fid is null or not public.is_family_parent(fid) then raise exception 'Only a parent can do this'; end if;
  delete from public.family_invites where id = p_invite and used_at is null;
end $$;

-- lets the invite page say "Jordan invited you as Maya" before sign in (reveals only a name pair, needs the secret token)
create or replace function public.invite_preview(p_token text)
returns jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('family', f.name, 'person', (select r.data ->> 'name' from public.records r where r.family_id = i.family_id and r.tbl = 'members' and r.rid = i.member_id::text and not r.deleted))
  from public.family_invites i join public.families f on f.id = i.family_id
  where i.token = trim(p_token) and i.used_at is null and i.expires_at > now()
$$;

create or replace function public.use_invite(i public.family_invites, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.family_members (family_id, user_id, status, role, access, member_id)
    values (i.family_id, p_user, 'approved', i.role, i.access, i.member_id)
    on conflict (family_id, user_id) do update set status = 'approved', role = case when public.family_members.role = 'owner' then 'owner' else excluded.role end,
      access = excluded.access, member_id = excluded.member_id;
  update public.family_invites set used_by = p_user, used_at = now() where id = i.id;
  return public.membership_json(i.family_id, p_user);
end $$;
revoke execute on function public.use_invite(public.family_invites, uuid) from public, anon, authenticated;

create or replace function public.accept_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.family_invites;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select * into i from public.family_invites where token = trim(p_token) and used_at is null and expires_at > now() for update;
  if not found then raise exception 'This invite link has already been used or has expired. Ask for a new one.'; end if;
  return public.use_invite(i, (select auth.uid()));
end $$;

-- a verified email that matches an open invite joins automatically (Google or password, same result)
create or replace function public.claim_invites()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.family_invites; u auth.users;
begin
  select * into u from auth.users where id = (select auth.uid());
  if u.id is null or u.email is null or u.email_confirmed_at is null then return null; end if;
  select * into i from public.family_invites
    where lower(email) = lower(u.email) and used_at is null and expires_at > now() order by created_at desc limit 1 for update;
  if not found then return null; end if;
  return public.use_invite(i, u.id);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'join_family(text,text)', 'pending_requests(uuid)', 'family_accounts(uuid)', 'approve_member(uuid,uuid,bigint,text,text)', 'set_member_access(uuid,uuid,text,text)',
    'create_invite(uuid,bigint,text,text,text)', 'list_invites(uuid)', 'revoke_invite(uuid)', 'accept_invite(text)', 'claim_invites()'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
