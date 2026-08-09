-- Production hotfix: repair the operation identity serialization trigger contract.
-- The serialization migration referenced helper names that do not exist in the
-- canonical production schema. Keep the advisory-lock behavior unchanged and
-- bind it to the identity-v1 helpers that are actually defined by
-- 20260808112324_transaction_identity_shadow_v1.sql.

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

  v_entity := private.sanad_identity_entity_code(
    new.financial_entity_code,
    new.financial_entity
  );
  v_reference := private.sanad_identity_normalize_reference(new.reference_number);
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

revoke all on function private.lock_operation_identity_key()
from public,anon,authenticated;

comment on function private.lock_operation_identity_key() is
  'Serializes completed-operation identity evaluation by the canonical identity-v1 helpers, falling back to file SHA-256, so concurrent duplicates cannot both become canonical.';
