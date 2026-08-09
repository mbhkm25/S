-- Bind authenticated operation intake rows to a real object owned by the caller.
-- This prevents queue/AI abuse through forged database rows that reference missing,
-- foreign, or metadata-mismatched storage objects.

create or replace function private.enforce_authenticated_operation_storage_contract()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_object storage.objects%rowtype;
  v_object_mime text;
  v_object_size bigint;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select * into v_object
  from storage.objects
  where bucket_id='operation-files'
    and name=new.file_path
  limit 1;

  if not found then
    raise exception 'operation_file_not_found' using errcode='42501';
  end if;

  if v_object.owner_id is distinct from v_uid::text then
    raise exception 'operation_file_owner_mismatch' using errcode='42501';
  end if;

  v_object_mime := lower(split_part(coalesce(v_object.metadata->>'mimetype',''),';',1));
  v_object_size := case
    when coalesce(v_object.metadata->>'size','') ~ '^[0-9]+$'
      then (v_object.metadata->>'size')::bigint
    else null
  end;

  if v_object_mime is distinct from lower(split_part(coalesce(new.file_mime_type,''),';',1)) then
    raise exception 'operation_file_mime_mismatch' using errcode='42501';
  end if;

  if v_object_size is null or v_object_size is distinct from new.file_size then
    raise exception 'operation_file_size_mismatch' using errcode='42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists a01_authenticated_operation_storage_guard on public.operations;
create trigger a01_authenticated_operation_storage_guard
before insert on public.operations
for each row execute function private.enforce_authenticated_operation_storage_contract();

revoke all on function private.enforce_authenticated_operation_storage_contract() from public, anon, authenticated;
