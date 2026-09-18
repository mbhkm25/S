-- SANAD AI governed ERP read contract v1
-- AI may read semantic ERP read models only; it does not receive raw source-table rows.

create or replace function public.get_ai_erp_read_context_v1(
  p_business_id uuid,
  p_query_kind text default 'replica_status',
  p_subject_account_id bigint default null,
  p_from date default (current_date-30),
  p_to date default current_date,
  p_limit integer default 30,
  p_purpose text default 'assistant_query'
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_kind text := lower(btrim(coalesce(p_query_kind,'replica_status')));
  v_limit integer := least(greatest(coalesce(p_limit,30),1),100);
  v_context jsonb;
  v_log_id uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_business_id is null then raise exception 'business_id_required' using errcode='22023'; end if;
  if p_to<p_from then raise exception 'invalid_date_range' using errcode='22023'; end if;
  if not public.can_access_business_financial_v1(p_business_id) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;
  if v_kind not in ('replica_status','customer_statement','sales','purchases') then
    raise exception 'invalid_erp_ai_query_kind' using errcode='22023';
  end if;

  if v_kind='replica_status' then
    v_context := public.get_business_erp_snapshot_status_v1(p_business_id);

  elsif v_kind='customer_statement' then
    if p_subject_account_id is null then raise exception 'subject_account_id_required' using errcode='22023'; end if;
    v_context := public.get_business_erp_customer_statement_v1(
      p_business_id,p_subject_account_id,p_from,p_to
    );

    -- Bound the AI payload while preserving totals and identity.
    v_context := v_context || jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(value)
        from (
          select value
          from jsonb_array_elements(coalesce(v_context->'items','[]'::jsonb))
          limit v_limit
        ) x
      ),'[]'::jsonb),
      'result_limit',v_limit
    );

  elsif v_kind='sales' then
    v_context := public.get_business_erp_documents_v1(
      p_business_id,'sale',null,p_from,p_to,v_limit,0
    );

  elsif v_kind='purchases' then
    v_context := public.get_business_erp_documents_v1(
      p_business_id,'purchase',null,p_from,p_to,v_limit,0
    );
  end if;

  insert into public.ai_financial_context_access_log(
    user_id,scope_kind,business_id,period_from,period_to,result_contract_version,purpose,metadata
  ) values (
    v_user,'business',p_business_id,p_from,p_to,1,
    left(nullif(btrim(coalesce(p_purpose,'')),''),120),
    jsonb_build_object(
      'source','get_ai_erp_read_context_v1',
      'erp_query_kind',v_kind,
      'subject_account_id',p_subject_account_id,
      'limit',v_limit,
      'raw_erp_rows_exposed',false
    )
  ) returning id into v_log_id;

  return jsonb_build_object(
    'contract_version',1,
    'access_log_id',v_log_id,
    'scope_kind','business',
    'business_id',p_business_id,
    'query_kind',v_kind,
    'read_only',true,
    'canonical_truth','source_erp_semantic_read_model',
    'context',v_context
  );
end;
$function$;

revoke all on function public.get_ai_erp_read_context_v1(uuid,text,bigint,date,date,integer,text) from public,anon;
grant execute on function public.get_ai_erp_read_context_v1(uuid,text,bigint,date,date,integer,text) to authenticated;
