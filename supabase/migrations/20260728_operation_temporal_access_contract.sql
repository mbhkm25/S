begin;

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
  v_operation uuid;
  v_existing boolean := false;
  v_usage jsonb;
  v_result jsonb;
  v_temporal jsonb;
begin
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','not_authenticated','requires_auth',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_public_token::text, 0));

  select id into v_operation
  from public.operations
  where public_token=p_public_token
  limit 1;

  if v_operation is not null then
    select exists(
      select 1 from public.operation_access_logs
      where user_id=v_user and operation_id=v_operation
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

  if coalesce((v_result->>'allowed')::boolean,false) and v_operation is not null then
    select jsonb_build_object(
      'transaction_date',o.transaction_date,
      'transaction_time',case when o.transaction_time_present then o.transaction_time else null end,
      'transaction_time_present',coalesce(o.transaction_time_present,false),
      'transaction_date_source',o.transaction_date_source,
      'transaction_timezone',case when o.transaction_time_present then o.transaction_timezone else null end
    ) into v_temporal
    from public.operations o
    where o.id=v_operation;

    v_result := jsonb_set(
      v_result,
      '{operation}',
      coalesce(v_result->'operation','{}'::jsonb) || coalesce(v_temporal,'{}'::jsonb),
      true
    );
  end if;

  return jsonb_set(v_result,'{usage}',public.get_my_operation_access_usage(),true);
end;
$$;

update public.operations
set sanad_time_check = jsonb_build_object(
  'status','not_applicable',
  'reason','transaction_time_not_present',
  'message','فحص فرق الوقت غير منطبق لأن الوقت غير مذكور في الإشعار.'
)
where coalesce(transaction_time_present,false)=false
  and coalesce(sanad_time_check->>'status','') <> 'not_applicable';

commit;
