create or replace function private.sanitize_operation_identifier_type_for_storage(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case lower(coalesce(trim(p_value), ''))
    when 'financial_account_number' then 'account_number'
    when 'account_number' then 'account_number'
    when 'wallet_number' then 'wallet_number'
    when 'customer_line' then 'financial_line'
    when 'financial_line' then 'financial_line'
    when 'merchant_point' then 'merchant_point'
    when 'terminal_number' then 'terminal_number'
    when 'phone_number' then 'phone_number'
    when 'iban' then 'iban'
    when 'national_id' then 'other'
    when 'passport_number' then 'other'
    when 'unique_account_name' then 'other'
    when 'card_number' then 'other'
    when 'document_reference' then 'other'
    when 'transfer_reference' then 'other'
    when 'other' then 'other'
    when 'unknown_identifier' then 'unknown'
    when 'unknown' then 'unknown'
    else 'unknown'
  end;
$$;

create or replace function private.enforce_operation_identifier_persistence_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_semantic_sender_type text;
  v_semantic_receiver_type text;
begin
  v_semantic_sender_type := coalesce(
    nullif(trim(new.raw_ai_json->'normalized'->>'sender_identifier_type'), ''),
    nullif(trim(new.raw_ai_json->'extracted'->>'sender_identifier_type'), ''),
    nullif(trim(new.structured_data->>'sender_identifier_type_semantic'), ''),
    nullif(trim(new.structured_data->>'sender_identifier_type'), ''),
    new.sender_identifier_type,
    'unknown_identifier'
  );

  v_semantic_receiver_type := coalesce(
    nullif(trim(new.raw_ai_json->'normalized'->>'receiver_identifier_type'), ''),
    nullif(trim(new.raw_ai_json->'extracted'->>'receiver_identifier_type'), ''),
    nullif(trim(new.structured_data->>'receiver_identifier_type_semantic'), ''),
    nullif(trim(new.structured_data->>'receiver_identifier_type'), ''),
    new.receiver_identifier_type,
    'unknown_identifier'
  );

  new.sender_identifier_type := private.sanitize_operation_identifier_type_for_storage(
    v_semantic_sender_type
  );
  new.receiver_identifier_type := private.sanitize_operation_identifier_type_for_storage(
    v_semantic_receiver_type
  );

  new.structured_data := coalesce(new.structured_data, '{}'::jsonb) || jsonb_build_object(
    'sender_identifier_type_semantic', v_semantic_sender_type,
    'receiver_identifier_type_semantic', v_semantic_receiver_type,
    'sender_identifier_type', new.sender_identifier_type,
    'receiver_identifier_type', new.receiver_identifier_type,
    'identifier_contract_version', 3
  );

  return new;
end;
$$;

drop trigger if exists trg_zz_enforce_operation_identifier_persistence_contract on public.operations;

create trigger trg_zz_enforce_operation_identifier_persistence_contract
before insert or update of raw_ai_json, structured_data, ai_status, sender_identifier_type, receiver_identifier_type
on public.operations
for each row
execute function private.enforce_operation_identifier_persistence_contract();

comment on function private.sanitize_operation_identifier_type_for_storage(text) is
'Projects rich semantic financial identifier types into the stable operations-table vocabulary.';

comment on function private.enforce_operation_identifier_persistence_contract() is
'Final database boundary for operation identifier types. Preserves semantic types in structured_data and stores only constraint-safe operational types in columns.';
