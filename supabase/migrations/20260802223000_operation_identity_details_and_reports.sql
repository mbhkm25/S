begin;

-- Preserve the established access policy and enrich only the successful operation payload.
alter function public.open_operation_access(uuid,text)
  rename to open_operation_access_identity_core;

revoke all on function public.open_operation_access_identity_core(uuid,text) from public,anon,authenticated;

create function public.open_operation_access(
  p_public_token uuid,
  p_source text default 'link'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
  v_operation_id uuid;
  v_identity jsonb;
begin
  v_result := public.open_operation_access_identity_core(p_public_token,p_source);

  if not coalesce((v_result->>'allowed')::boolean,false) or not (v_result ? 'operation') then
    return v_result;
  end if;

  v_operation_id := nullif(v_result#>>'{operation,id}','')::uuid;
  if v_operation_id is null then
    return v_result;
  end if;

  select jsonb_build_object(
    'raw_receiver_name',o.receiver_name,
    'raw_sender_name',o.sender_name,
    'resolved_business_name',case
      when linked.business_id is not null then linked.business_name
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then shadow.matched_business_name
      else null
    end,
    'resolved_account_holder_name',case
      when linked.financial_account_id is not null then linked.account_holder_name
      when shadow.matched_account_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then shadow.matched_account_holder_name
      else null
    end,
    'identity_source',case
      when linked.business_id is not null then 'linked_business'
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then 'exact_identifier_match'
      else 'document_extraction'
    end,
    'identity_confidence',case
      when linked.business_id is not null then 1::numeric
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then least(shadow.match_score/100.0,1::numeric)
      else coalesce((o.field_confidences->>'receiver_name')::numeric,o.confidence_score,0)
    end,
    'has_name_conflict',case
      when linked.business_id is not null then
        nullif(trim(coalesce(o.receiver_name,'')),'') is not null
        and public.normalize_financial_name(o.receiver_name)
          is distinct from public.normalize_financial_name(linked.business_name)
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match' then
        nullif(trim(coalesce(o.receiver_name,'')),'') is not null
        and public.normalize_financial_name(o.receiver_name)
          is distinct from public.normalize_financial_name(shadow.matched_business_name)
      else false
    end,
    'match_strategy',shadow.match_strategy,
    'match_score',shadow.match_score,
    'reason_codes',coalesce(shadow.reason_codes,'[]'::jsonb),
    'display_title',case
      when linked.business_id is not null then 'عملية لدى '||linked.business_name
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then 'عملية مطابقة لحساب '||shadow.matched_business_name
      else coalesce(nullif(o.summary,''),'إشعار مالي')
    end
  ) into v_identity
  from public.operations o
  left join lateral (
    select bol.business_id,bp.name business_name,bpi.financial_account_id,bfa.account_holder_name
    from public.business_operation_links bol
    join public.business_profiles bp on bp.id=bol.business_id
    left join public.business_payment_inbox bpi
      on bpi.business_id=bol.business_id and bpi.operation_id=bol.operation_id
    left join public.business_financial_accounts bfa on bfa.id=bpi.financial_account_id
    where bol.operation_id=o.id and bol.status='linked'
    order by bol.updated_at desc,bol.id desc
    limit 1
  ) linked on true
  left join lateral (
    select run.matched_business_id,bp.name matched_business_name,
           run.matched_account_id,bfa.account_holder_name matched_account_holder_name,
           run.match_score,run.match_strategy,coalesce(run.reason_codes,'[]'::jsonb) reason_codes
    from public.operation_routing_shadow_runs run
    left join public.business_profiles bp on bp.id=run.matched_business_id
    left join public.business_financial_accounts bfa on bfa.id=run.matched_account_id
    where run.operation_id=o.id and run.status in ('high_confidence_match','probable_match')
    order by run.created_at desc,run.id desc
    limit 1
  ) shadow on true
  where o.id=v_operation_id;

  return jsonb_set(
    jsonb_set(v_result,'{operation,identity_projection}',coalesce(v_identity,'{}'::jsonb),true),
    '{operation,display_title}',
    coalesce(v_identity->'display_title',to_jsonb(coalesce(v_result#>>'{operation,summary}','إشعار مالي'))),
    true
  );
end;
$function$;

revoke all on function public.open_operation_access(uuid,text) from public,anon;
grant execute on function public.open_operation_access(uuid,text) to authenticated;

-- Keep report generation compatible while ensuring operation rows never promote raw OCR
-- names to official business identity.
alter function public.get_report_payload_v2(uuid)
  rename to get_report_payload_v2_identity_core;

revoke all on function public.get_report_payload_v2_identity_core(uuid) from public,anon,authenticated;

create function public.get_report_payload_v2(p_report_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_operations jsonb;
begin
  v_payload := public.get_report_payload_v2_identity_core(p_report_request_id);

  select coalesce(jsonb_agg(
    item.op || jsonb_build_object(
      'raw_receiver_name',o.receiver_name,
      'resolved_business_name',case
        when linked.business_id is not null then linked.business_name
        when shadow.matched_business_id is not null
         and shadow.match_score>=95
         and shadow.reason_codes ? 'unique_exact_identifier_match'
          then shadow.matched_business_name
        else null
      end,
      'resolved_account_holder_name',case
        when linked.financial_account_id is not null then linked.account_holder_name
        when shadow.matched_account_id is not null
         and shadow.match_score>=95
         and shadow.reason_codes ? 'unique_exact_identifier_match'
          then shadow.matched_account_holder_name
        else null
      end,
      'identity_source',case
        when linked.business_id is not null then 'linked_business'
        when shadow.matched_business_id is not null
         and shadow.match_score>=95
         and shadow.reason_codes ? 'unique_exact_identifier_match'
          then 'exact_identifier_match'
        else 'document_extraction'
      end,
      'has_name_conflict',case
        when linked.business_id is not null then
          nullif(trim(coalesce(o.receiver_name,'')),'') is not null
          and public.normalize_financial_name(o.receiver_name)
            is distinct from public.normalize_financial_name(linked.business_name)
        when shadow.matched_business_id is not null
         and shadow.match_score>=95
         and shadow.reason_codes ? 'unique_exact_identifier_match' then
          nullif(trim(coalesce(o.receiver_name,'')),'') is not null
          and public.normalize_financial_name(o.receiver_name)
            is distinct from public.normalize_financial_name(shadow.matched_business_name)
        else false
      end,
      'identity_display_title',case
        when linked.business_id is not null then 'عملية لدى '||linked.business_name
        when shadow.matched_business_id is not null
         and shadow.match_score>=95
         and shadow.reason_codes ? 'unique_exact_identifier_match'
          then 'عملية مطابقة لحساب '||shadow.matched_business_name
        else coalesce(nullif(item.op->>'summary',''),'إشعار مالي')
      end
    ) order by item.ordinality),'[]'::jsonb)
  into v_operations
  from jsonb_array_elements(coalesce(v_payload->'operations','[]'::jsonb))
       with ordinality item(op,ordinality)
  left join public.operations o on o.id=nullif(item.op->>'id','')::uuid
  left join lateral (
    select bol.business_id,bp.name business_name,bpi.financial_account_id,bfa.account_holder_name
    from public.business_operation_links bol
    join public.business_profiles bp on bp.id=bol.business_id
    left join public.business_payment_inbox bpi
      on bpi.business_id=bol.business_id and bpi.operation_id=bol.operation_id
    left join public.business_financial_accounts bfa on bfa.id=bpi.financial_account_id
    where bol.operation_id=o.id and bol.status='linked'
    order by bol.updated_at desc,bol.id desc
    limit 1
  ) linked on true
  left join lateral (
    select run.matched_business_id,bp.name matched_business_name,
           run.matched_account_id,bfa.account_holder_name matched_account_holder_name,
           run.match_score,coalesce(run.reason_codes,'[]'::jsonb) reason_codes
    from public.operation_routing_shadow_runs run
    left join public.business_profiles bp on bp.id=run.matched_business_id
    left join public.business_financial_accounts bfa on bfa.id=run.matched_account_id
    where run.operation_id=o.id and run.status in ('high_confidence_match','probable_match')
    order by run.created_at desc,run.id desc
    limit 1
  ) shadow on true;

  return jsonb_set(v_payload,'{operations}',coalesce(v_operations,'[]'::jsonb),true);
end;
$function$;

revoke all on function public.get_report_payload_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_report_payload_v2(uuid) to service_role;

comment on function public.open_operation_access(uuid,text) is
'Established operation access contract enriched with a separated resolved identity projection.';
comment on function public.get_report_payload_v2(uuid) is
'Report payload with raw extraction and resolved business identity kept as separate fields.';

commit;
