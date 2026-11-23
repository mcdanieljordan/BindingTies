-- Journal media (photos, voice notes, audio, video). A media row (records.tbl = 'journalMedia') and its file
-- (storage path <family>/journalMedia/<media id>) can be read by exactly the people who can read the journal entry it belongs to.
--   data: { id, entryId, ownerMemberId, kind: image|audio|video|file, name, mime, size, ... }
-- Only the author can add or remove media. Files are never overwritten (write once), and only the author can delete them.
-- Everything else keeps the rules from migrations 003 and 004.

create or replace function public.journal_media_can_read(fid uuid, p_data jsonb)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare e jsonb;
begin
  if p_data is null then return false; end if;
  select r.data into e from public.records r where r.family_id = fid and r.tbl = 'journal' and r.rid = p_data ->> 'entryId' and not r.deleted;
  return e is not null and public.journal_can_read(fid, e);
end $$;

create or replace function public.journal_media_can_write(fid uuid, p_data jsonb)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare me bigint := public.my_member_id(fid); e jsonb;
begin
  if p_data is null or me is null or public.journal_owner(p_data) is distinct from me then return false; end if;
  if coalesce(p_data ->> 'kind', '') not in ('image', 'audio', 'video', 'file') then return false; end if;
  if coalesce(p_data ->> 'size', '') !~ '^[0-9]+$' or (p_data ->> 'size')::bigint > 52428800 then return false; end if;
  -- it must hang off one of my own entries (or one that has not reached the server yet)
  select r.data into e from public.records r where r.family_id = fid and r.tbl = 'journal' and r.rid = p_data ->> 'entryId';
  if e is not null and public.journal_owner(e) is distinct from me then return false; end if;
  return true;
end $$;

revoke execute on function public.journal_media_can_read(uuid, jsonb), public.journal_media_can_write(uuid, jsonb) from public, anon;
grant execute on function public.journal_media_can_read(uuid, jsonb), public.journal_media_can_write(uuid, jsonb) to authenticated;

drop policy if exists "read records" on public.records;
drop policy if exists "insert records" on public.records;
drop policy if exists "update records" on public.records;
drop policy if exists "delete records" on public.records;

create policy "read records" on public.records for select to authenticated
  using (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then (deleted or public.journal_can_read(family_id, data))
      when 'journalMedia' then (deleted or public.journal_media_can_read(family_id, data))
      when 'policy' then true
      else (public.is_family_full(family_id) or public.limited_can_see(family_id, tbl, data))
    end));

create policy "insert records" on public.records for insert to authenticated
  with check (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then (public.journal_can_write(family_id, data) or (deleted and data is null))
      when 'journalMedia' then (public.journal_media_can_write(family_id, data) or (deleted and data is null))
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end));

create policy "update records" on public.records for update to authenticated
  using (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then public.journal_can_write(family_id, data)
      when 'journalMedia' then public.journal_media_can_write(family_id, data)
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end))
  with check (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then (public.journal_can_write(family_id, data) or (deleted and data is null))
      when 'journalMedia' then (public.journal_media_can_write(family_id, data) or (deleted and data is null))
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end));

create policy "delete records" on public.records for delete to authenticated
  using (public.is_family_member(family_id) and (
    case tbl
      when 'journal' then public.journal_can_write(family_id, data)
      when 'journalMedia' then public.journal_media_can_write(family_id, data)
      when 'policy' then public.is_family_parent(family_id)
      else (public.is_family_full(family_id) or public.limited_can_write(family_id, tbl))
    end));

-- ---------- the files ----------
drop policy if exists "family files read" on storage.objects;
drop policy if exists "family files update" on storage.objects;
drop policy if exists "family files delete" on storage.objects;

create policy "family files read" on storage.objects for select to authenticated
  using (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid) and (
    case coalesce((storage.foldername(name))[2], '')
      when 'journalMedia' then exists (select 1 from public.records r
        where r.family_id = ((storage.foldername(name))[1])::uuid and r.tbl = 'journalMedia' and r.rid = storage.filename(name)
          and not r.deleted and public.journal_media_can_read(r.family_id, r.data))
      when 'vault' then public.is_family_full(((storage.foldername(name))[1])::uuid)
      else true
    end));

-- journal files are write-once
create policy "family files update" on storage.objects for update to authenticated
  using (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[2], '') <> 'journalMedia');

-- only the author can delete a journal file
create policy "family files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'family-files' and public.is_family_member(((storage.foldername(name))[1])::uuid) and (
    case coalesce((storage.foldername(name))[2], '')
      when 'journalMedia' then exists (select 1 from public.records r
        where r.family_id = ((storage.foldername(name))[1])::uuid and r.tbl = 'journalMedia' and r.rid = storage.filename(name)
          and public.journal_media_can_write(r.family_id, r.data))
      else true
    end));
