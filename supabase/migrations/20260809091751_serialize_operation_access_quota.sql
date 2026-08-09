create or replace function public.open_operation_access_identity_core(p_public_token uuid, p_source text default 'link'::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid(); v_requested public.operations%rowtype; v_access public.operations%rowtype;
  v_reuse jsonb; v_existing boolean := false; v_usage jsonb; v_result jsonb;
begin
  if v_user is null then return jsonb_build_object('allowed',false,'reason','not_authenticated','requires_auth',true); end if;
  select * into v_requested from public.operations where public_token=p_public_token limit 1;
  if v_requested.id is null then return jsonb_build_object('allowed',false,'reason','operation_not_found'); end if;
  if v_requested.token_status is not null and v_requested.token_status<>'active' then return jsonb_build_object('allowed',false,'reason','token_not_active'); end if;
  if v_requested.token_expires_at is not null and v_requested.token_expires_at<=now() then return jsonb_build_object('allowed',false,'reason','token_expired'); end if;
  v_reuse := private.operation_reuse_resolution(v_requested.id);
  if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) and not coalesce((v_reuse->>'canonical_available')::boolean,false) then
    return jsonb_build_object('allowed',false,'reason','canonical_operation_unavailable','reuse',v_reuse);
  end if;
  if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) then
    select * into v_access from public.operations where id=nullif(v_reuse->>'canonical_operation_id','')::uuid;
  else v_access := v_requested; end if;

  -- One user's quota is shared across all operations. Serialize first-open attempts
  -- before reading remaining quota so different concurrent operations cannot both
  -- consume the final available slot.
  perform pg_advisory_xact_lock(hashtextextended('sanad-operation-access-quota:' || v_user::text,0));

  select exists(select 1 from public.operation_access_logs where user_id=v_user and operation_id=v_access.id) into v_existing;
  v_usage := public.get_my_operation_access_usage();
  if not v_existing and coalesce((v_usage->>'remaining')::integer,0)<=0 then
    return jsonb_build_object('allowed',false,'reason','access_limit_reached','requires_subscription',true,'usage',v_usage,
      'reuse',v_reuse || jsonb_build_object('access_will_consume',false));
  end if;
  v_result := public.sanad_open_operation_access_legacy(v_access.public_token,p_source);
  if coalesce((v_result->>'allowed')::boolean,false) and v_result ? 'operation' then
    v_result := jsonb_set(v_result,'{operation,received_at}',coalesce(to_jsonb(v_access.received_at),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,received_timezone}',to_jsonb(coalesce(v_access.received_timezone,'Asia/Aden')),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date}',coalesce(to_jsonb(v_access.transaction_date),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time}',coalesce(to_jsonb(v_access.transaction_time),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time_present}',coalesce(to_jsonb(v_access.transaction_time_present),'false'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date_source}',coalesce(to_jsonb(v_access.transaction_date_source),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_timezone}',coalesce(to_jsonb(v_access.transaction_timezone),'null'::jsonb),true);
  end if;
  v_result := jsonb_set(coalesce(v_result,jsonb_build_object('allowed',false,'reason','invalid_operation_payload')),'{usage}',coalesce(public.get_my_operation_access_usage(),'{}'::jsonb),true);
  return jsonb_set(v_result,'{reuse}',v_reuse || jsonb_build_object('access_will_consume',not v_existing),true);
end;
$function$;
