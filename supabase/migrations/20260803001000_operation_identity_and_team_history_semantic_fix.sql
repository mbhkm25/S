begin;

create or replace function private.operation_identity_name_conflict(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  with source as (
    select o.receiver_name as raw_name,
      coalesce(
        linked.account_holder_name,
        linked.business_name,
        shadow.account_holder_name,
        shadow.business_name
      ) as trusted_name
    from public.operations o
    left join lateral (
      select bfa.account_holder_name,bp.name as business_name
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
      select bfa.account_holder_name,bp.name as business_name
      from public.operation_routing_shadow_runs run
      left join public.business_profiles bp on bp.id=run.matched_business_id
      left join public.business_financial_accounts bfa on bfa.id=run.matched_account_id
      where run.operation_id=o.id
        and run.status in ('high_confidence_match','probable_match')
        and run.match_score>=95
        and coalesce(run.reason_codes,'[]'::jsonb) ? 'unique_exact_identifier_match'
      order by run.created_at desc,run.id desc
      limit 1
    ) shadow on true
    where o.id=p_operation_id
  )
  select case
    when nullif(trim(coalesce(raw_name,'')),'') is null then false
    when nullif(trim(coalesce(trusted_name,'')),'') is null then false
    else public.normalize_financial_name(raw_name)
      is distinct from public.normalize_financial_name(trusted_name)
  end
  from source;
$function$;

alter function public.get_operation_identity_projection(uuid[])
  rename to get_operation_identity_projection_semantic_core;
revoke all on function public.get_operation_identity_projection_semantic_core(uuid[]) from public,anon,authenticated;

create function public.get_operation_identity_projection(p_operation_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_items jsonb;
begin
  v_payload:=public.get_operation_identity_projection_semantic_core(p_operation_ids);
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'has_name_conflict',private.operation_identity_name_conflict((item->>'operation_id')::uuid)
    ) order by item->>'operation_id'
  ),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) item;
  return jsonb_set(v_payload,'{items}',v_items,true);
end;
$function$;
revoke all on function public.get_operation_identity_projection(uuid[]) from public,anon;
grant execute on function public.get_operation_identity_projection(uuid[]) to authenticated;

alter function public.get_my_operations(text,timestamptz,timestamptz,integer,integer)
  rename to get_my_operations_identity_semantic_core;
revoke all on function public.get_my_operations_identity_semantic_core(text,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;

create function public.get_my_operations(
  p_relation_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  operation_id uuid,public_token uuid,relation_type text,status text,ai_status text,
  summary text,amount numeric,currency text,financial_entity text,reference_number text,
  transaction_type text,created_at timestamptz,relation_created_at timestamptz,
  verified_at timestamptz,confidence_score numeric,sanad_risk_level text,
  possible_fraud boolean,raw_receiver_name text,resolved_business_name text,
  resolved_account_holder_name text,identity_source text,identity_confidence numeric,
  has_name_conflict boolean,match_strategy text,match_score numeric
)
language sql
stable
security invoker
set search_path=''
as $function$
  select c.operation_id,c.public_token,c.relation_type,c.status,c.ai_status,c.summary,
    c.amount,c.currency,c.financial_entity,c.reference_number,c.transaction_type,
    c.created_at,c.relation_created_at,c.verified_at,c.confidence_score,c.sanad_risk_level,
    c.possible_fraud,c.raw_receiver_name,c.resolved_business_name,
    c.resolved_account_holder_name,c.identity_source,c.identity_confidence,
    private.operation_identity_name_conflict(c.operation_id),c.match_strategy,c.match_score
  from public.get_my_operations_identity_semantic_core(
    p_relation_type,p_from,p_to,p_limit,p_offset
  ) c;
$function$;
revoke all on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) to authenticated;

alter function public.open_operation_access(uuid,text)
  rename to open_operation_access_semantic_core;
revoke all on function public.open_operation_access_semantic_core(uuid,text) from public,anon,authenticated;

create function public.open_operation_access(p_public_token uuid,p_source text default 'link')
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_operation_id uuid;
  v_conflict boolean;
begin
  v_payload:=public.open_operation_access_semantic_core(p_public_token,p_source);
  v_operation_id:=nullif(v_payload#>>'{operation,id}','')::uuid;
  if v_operation_id is null or not (v_payload#>'{operation,identity_projection}' is not null) then
    return v_payload;
  end if;
  v_conflict:=private.operation_identity_name_conflict(v_operation_id);
  return jsonb_set(v_payload,'{operation,identity_projection,has_name_conflict}',to_jsonb(coalesce(v_conflict,false)),true);
end;
$function$;
revoke all on function public.open_operation_access(uuid,text) from public,anon;
grant execute on function public.open_operation_access(uuid,text) to authenticated;

alter function public.get_report_payload_v2(uuid)
  rename to get_report_payload_v2_semantic_core;
revoke all on function public.get_report_payload_v2_semantic_core(uuid) from public,anon,authenticated;

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
  v_payload:=public.get_report_payload_v2_semantic_core(p_report_request_id);
  select coalesce(jsonb_agg(
    item.op || jsonb_build_object(
      'has_name_conflict',private.operation_identity_name_conflict(nullif(item.op->>'id','')::uuid)
    ) order by item.ordinality
  ),'[]'::jsonb)
  into v_operations
  from jsonb_array_elements(coalesce(v_payload->'operations','[]'::jsonb))
    with ordinality item(op,ordinality);
  return jsonb_set(v_payload,'{operations}',v_operations,true);
end;
$function$;
revoke all on function public.get_report_payload_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_report_payload_v2(uuid) to service_role;

alter function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer)
  rename to get_business_team_member_operations_v2_semantic_core;
revoke all on function public.get_business_team_member_operations_v2_semantic_core(uuid,uuid,text,integer,integer) from public,anon,authenticated;

create function public.get_business_team_member_operations_v2(
  p_business_id uuid,p_member_user_id uuid,p_activity_type text default 'all',
  p_limit integer default 50,p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_items jsonb;
  v_review_count bigint;
begin
  v_payload:=public.get_business_team_member_operations_v2_semantic_core(
    p_business_id,p_member_user_id,p_activity_type,p_limit,p_offset
  );

  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          item,
          '{operation,has_name_conflict}',
          to_jsonb(private.operation_identity_name_conflict((item->>'operation_id')::uuid)),
          true
        ),
        '{contribution,completed}',
        to_jsonb(coalesce((item#>>'{contribution,completed}')::boolean,false)),
        true
      ),
      '{contribution,requested_review}',
      to_jsonb(exists(
        select 1 from public.business_payment_inbox_events e
        where e.business_id=p_business_id
          and e.operation_id=(item->>'operation_id')::uuid
          and e.actor_user_id=p_member_user_id
          and e.event_type='review_required'
      )),
      true
    ) order by (item->>'latest_member_activity_at')::timestamptz desc
  ),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) item;

  select count(distinct operation_id)
  into v_review_count
  from public.business_payment_inbox_events
  where business_id=p_business_id
    and actor_user_id=p_member_user_id
    and event_type='review_required';

  v_payload:=jsonb_set(v_payload,'{items}',v_items,true);
  v_payload:=jsonb_set(v_payload,'{summary,review_requested_count}',to_jsonb(coalesce(v_review_count,0)),true);
  return v_payload;
end;
$function$;
revoke all on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) to authenticated;

comment on function private.operation_identity_name_conflict(uuid) is
'Compares extracted receiver name with the resolved financial account holder first, falling back to business name only when no account-holder identity exists.';

commit;
