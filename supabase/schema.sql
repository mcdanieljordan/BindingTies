-- FamilyOS sync + push schema. Apply once to a NEW Supabase project.
create extension if not exists pgcrypto;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  tz text not null default 'America/Chicago',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index on public.family_members (user_id);

create or replace function public.is_family_member(fid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = (select auth.uid()))
$$;

-- One generic synced store: every app table row is a JSON record.
create table public.records (
  family_id uuid not null references public.families(id) on delete cascade,
  tbl text not null,
  rid text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (family_id, tbl, rid)
);
create index records_pull_idx on public.records (family_id, updated_at);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (family_id);

-- server-only tables (RLS on, no policies => only the service role can touch them)
create table public.push_log (key text primary key, created_at timestamptz not null default now());
create table public.server_config (key text primary key, value text not null);
alter table public.push_log enable row level security;
alter table public.server_config enable row level security;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.records enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "members read their family" on public.families for select to authenticated
  using (public.is_family_member(id));
create policy "read own membership" on public.family_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "members read records" on public.records for select to authenticated
  using (public.is_family_member(family_id));
create policy "members insert records" on public.records for insert to authenticated
  with check (public.is_family_member(family_id));
create policy "members update records" on public.records for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "members delete records" on public.records for delete to authenticated
  using (public.is_family_member(family_id));
create policy "own push subs" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) and public.is_family_member(family_id))
  with check (user_id = (select auth.uid()) and public.is_family_member(family_id));

create or replace function public.create_family(p_name text, p_tz text default 'America/Chicago')
returns public.families language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.families (name, tz, invite_code, created_by)
    values (left(coalesce(nullif(trim(p_name), ''), 'Our family'), 60), coalesce(p_tz, 'America/Chicago'),
            upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)), (select auth.uid()))
    returning * into f;
  insert into public.family_members (family_id, user_id) values (f.id, (select auth.uid()));
  return f;
end $$;

create or replace function public.join_family(p_code text)
returns public.families language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select * into f from public.families where invite_code = upper(trim(p_code));
  if not found then raise exception 'That invite code was not found'; end if;
  insert into public.family_members (family_id, user_id) values (f.id, (select auth.uid())) on conflict do nothing;
  return f;
end $$;

revoke execute on function public.create_family(text, text) from public, anon;
revoke execute on function public.join_family(text) from public, anon;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text) to authenticated;
revoke execute on function public.is_family_member(uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated;

-- realtime for live updates between devices
alter publication supabase_realtime add table public.records;

-- private file storage (vault PDFs/photos, routine pictures), one folder per family
insert into storage.buckets (id, name, public, file_size_limit)
  values ('family-files', 'family-files', false, 52428800) on conflict (id) do nothing;
create policy "family files read" on storage.objects for select to authenticated
  using (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "family files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "family files update" on storage.objects for update to authenticated
  using (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "family files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid));
