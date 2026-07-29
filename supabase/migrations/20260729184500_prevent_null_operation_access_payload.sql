-- Prevent nullable temporal fields from nullifying the complete operation payload.
-- The previous wrapper passed SQL NULL to jsonb_set when transaction_time or
-- another optional field was absent. PostgreSQL then returned SQL NULL for the
-- whole expression, causing every affected operation to appear missing.

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
    v_result := jsonb_set(v_result,'{operation,received_at}',coalesce(to_jsonb(v_operation.received_at),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,received_timezone}',to_jsonb(coalesce(v_operation.received_timezone,'Asia/Aden')),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date}',coalesce(to_jsonb(v_operation.transaction_date),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time}',coalesce(to_jsonb(v_operation.transaction_time),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time_present}',coalesce(to_jsonb(v_operation.transaction_time_present),'false'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date_source}',coalesce(to_jsonb(v_operation.transaction_date_source),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_timezone}',coalesce(to_jsonb(v_operation.transaction_timezone),'null'::jsonb),true);
  end if;

  return jsonb_set(
    coalesce(v_result,jsonb_build_object('allowed',false,'reason','invalid_operation_payload')),
    '{usage}',
    coalesce(public.get_my_operation_access_usage(),'{}'::jsonb),
    true
  );
end;
$$;

comment on function public.open_operation_access(uuid,text) is
'Opens an operation without allowing nullable temporal fields to nullify the complete JSON response. Canonical local time fields are returned as JSON null when absent.';
