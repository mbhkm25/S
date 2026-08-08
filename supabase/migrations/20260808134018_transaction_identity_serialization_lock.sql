create or replace function private.lock_operation_identity_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity text;
  v_reference text;
  v_file_sha text;
  v_lock_key text;
begin
  if coalesce(new.ai_status,'') <> 'completed' then
    return new;
  end if;

  v_entity := private.canonical_financial_entity_code(new.financial_entity_code,new.financial_entity);
  v_reference := private.normalize_identity_token(new.reference_number);
  v_file_sha := lower(nullif(trim(coalesce(new.file_sha256,'')),''));

  if v_entity is not null and v_reference is not null then
    v_lock_key := 'sanad:transaction-identity:v1:ref:' || v_entity || ':' || v_reference;
  elsif v_file_sha is not null then
    v_lock_key := 'sanad:transaction-identity:v1:file:' || v_file_sha;
  else
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_lock_key,0));
  return new;
end;
$$;

revoke all on function private.lock_operation_identity_key() from public,anon,authenticated;

drop trigger if exists operations_identity_serialization_before_write on public.operations;
create trigger operations_identity_serialization_before_write
before insert or update of ai_status,financial_entity_code,financial_entity,reference_number,file_sha256
on public.operations
for each row execute function private.lock_operation_identity_key();

comment on function private.lock_operation_identity_key() is
  'Serializes completed-operation identity evaluation by canonical entity+reference, falling back to file SHA-256, so concurrent duplicates cannot both become canonical.';
