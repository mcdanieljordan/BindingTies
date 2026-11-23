-- Sitter links: a parent shares a read-only, expiring view (emergency info, schedule, medicine times, routines, notes)
-- with someone who has no account. The link carries a random token that is stored only as a SHA-256 hash.
-- The table has row level security on and no policies: nobody can read it directly. Parents use the three functions below;
-- the public `sitter-view` edge function (service role) looks a token up and builds the page.

create table if not exists public.sitter_passes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  label text not null default 'Sitter',
  token_hash text not null unique,
  member_ids bigint[] not null default '{}',
  options jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0
);
create index if not exists sitter_passes_family_idx on public.sitter_passes (family_id);
alter table public.sitter_passes enable row level security;

create or replace function public.create_sitter_pass(p_family uuid, p_label text, p_members bigint[], p_options jsonb, p_notes text, p_hours int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tok text; hrs int := least(168, greatest(1, coalesce(p_hours, 12))); v public.sitter_passes;
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can make a sitter link'; end if;
  if coalesce(array_length(p_members, 1), 0) = 0 then raise exception 'Choose at least one person'; end if;
  if (select count(*) from public.sitter_passes where family_id = p_family and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'Too many active sitter links. Turn one off first.';
  end if;
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  tok := replace(tok, '=', '');
  insert into public.sitter_passes (family_id, label, token_hash, member_ids, options, notes, expires_at)
  values (p_family, left(coalesce(nullif(trim(p_label), ''), 'Sitter'), 60), encode(extensions.digest(tok, 'sha256'), 'hex'), p_members,
          coalesce(p_options, '{}'::jsonb), left(nullif(trim(coalesce(p_notes, '')), ''), 2000), now() + make_interval(hours => hrs))
  returning * into v;
  return jsonb_build_object('id', v.id, 'token', tok, 'expires_at', v.expires_at);
end $$;

create or replace function public.list_sitter_passes(p_family uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_family_parent(p_family) then raise exception 'Only a parent can see sitter links'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'member_ids', s.member_ids, 'options', s.options,
            'created_at', s.created_at, 'expires_at', s.expires_at, 'revoked_at', s.revoked_at, 'last_viewed_at', s.last_viewed_at, 'view_count', s.view_count)
          order by s.created_at desc)
          from public.sitter_passes s where s.family_id = p_family and s.created_at > now() - interval '30 days'), '[]'::jsonb);
end $$;

create or replace function public.revoke_sitter_pass(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select family_id into fid from public.sitter_passes where id = p_id;
  if fid is null or not public.is_family_parent(fid) then raise exception 'Not allowed'; end if;
  update public.sitter_passes set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

revoke execute on function public.create_sitter_pass(uuid, text, bigint[], jsonb, text, int), public.list_sitter_passes(uuid), public.revoke_sitter_pass(uuid) from public, anon;
grant execute on function public.create_sitter_pass(uuid, text, bigint[], jsonb, text, int), public.list_sitter_passes(uuid), public.revoke_sitter_pass(uuid) to authenticated;
