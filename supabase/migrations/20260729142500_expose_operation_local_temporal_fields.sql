-- Preserve and expose the wall-clock date/time printed in the financial document.
-- Applied to production on 2026-07-29.

create or replace function public.open_operation_access(
  p_public_token uuid,
  p_source text default 'link'::text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_existing boolean := false;
  v_usage jsonb;
  v_result jsonb;
begin
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','not_authenticated','requires_auth',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_public_token::text,0));

  select * into v_operation
  from public.operations
  where public_token=p_public_token
  limit 1;

  if v_operation.id is not null then
    select exists(
      select 1 from public.operation_access_logs
      where user_id=v_user and operation_id=v_operation.id
    ) into v_existing;
  end if;

  v_usage := public.get_my_operation_access_usage();
  if not v_existing and coalesce((v_usage->>'remaining')::integer,0)<=0 then
    return jsonb_build_object(
      'allowed',false,'reason','access_limit_reached',
      'requires_subscription',true,'usage',v_usage
    );
  end if;

  v_result := public.sanad_open_operation_access_legacy(p_public_token,p_source);

  if coalesce((v_result->>'allowed')::boolean,false) and v_result ? 'operation' then
    v_result := jsonb_set(v_result,'{operation,received_at}',to_jsonb(v_operation.received_at),true);
    v_result := jsonb_set(v_result,'{operation,received_timezone}',to_jsonb(coalesce(v_operation.received_timezone,'Asia/Aden')),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date}',to_jsonb(v_operation.transaction_date),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time}',to_jsonb(v_operation.transaction_time),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time_present}',to_jsonb(v_operation.transaction_time_present),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date_source}',to_jsonb(v_operation.transaction_date_source),true);
    v_result := jsonb_set(v_result,'{operation,transaction_timezone}',to_jsonb(v_operation.transaction_timezone),true);
  end if;

  return jsonb_set(v_result,'{usage}',public.get_my_operation_access_usage(),true);
end;
$$;

comment on function public.open_operation_access(uuid,text) is
'Returns canonical local transaction date/time fields in addition to transaction_datetime. UI must display transaction_date + transaction_time as printed in the financial document and must not derive wall-clock time by slicing the UTC timestamptz.';
