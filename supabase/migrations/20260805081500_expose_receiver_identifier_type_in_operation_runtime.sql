do $migration$
declare
  v_definition text;
  v_old text := $needle$'receiver_account', coalesce(v_operation.receiver_account_normalized, v_operation.receiver_account, ''),$needle$;
  v_new text := $replacement$'receiver_account', coalesce(v_operation.receiver_account_normalized, v_operation.receiver_account, ''),
      'receiver_identifier_type', nullif(v_operation.receiver_identifier_type, ''),$replacement$;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_operation_details_runtime'
    and pg_get_function_identity_arguments(p.oid) = 'p_public_token uuid';

  if v_definition is null then
    raise exception 'get_operation_details_runtime(uuid) was not found';
  end if;

  if position(v_old in v_definition) = 0 then
    if position('receiver_identifier_type' in v_definition) > 0 then
      return;
    end if;
    raise exception 'receiver_account runtime contract marker was not found';
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;
