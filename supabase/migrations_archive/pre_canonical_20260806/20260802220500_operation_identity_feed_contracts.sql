begin;

-- Preserve the existing function arguments while extending the row contract with
-- trusted identity fields. Callers that ignore the new trailing columns remain compatible.
drop function if exists public.get_my_operations(text,timestamptz,timestamptz,integer,integer);

create function public.get_my_operations(
  p_relation_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  operation_id uuid,
  public_token uuid,
  relation_type text,
  status text,
  ai_status text,
  summary text,
  amount numeric,
  currency text,
  financial_entity text,
  reference_number text,
  transaction_type text,
  created_at timestamptz,
  relation_created_at timestamptz,
  verified_at timestamptz,
  confidence_score numeric,
  sanad_risk_level text,
  possible_fraud boolean,
  raw_receiver_name text,
  resolved_business_name text,
  resolved_account_holder_name text,
  identity_source text,
  identity_confidence numeric,
  has_name_conflict boolean,
  match_strategy text,
  match_score numeric
)
language sql
stable
security invoker
set search_path=''
as $function$
  select
    o.id,
    o.public_token,
    l.relation_type,
    o.status,
    o.ai_status,
    o.summary,
    o.amount,
    o.currency,
    o.financial_entity,
    o.reference_number,
    o.transaction_type,
    o.created_at,
    l.created_at,
    o.verified_at,
    o.confidence_score,
    o.sanad_risk_level,
    o.possible_fraud,
    o.receiver_name,
    case
      when linked.business_id is not null then linked.business_name
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then shadow.matched_business_name
      else null
    end,
    case
      when linked.financial_account_id is not null then linked.account_holder_name
      when shadow.matched_account_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then shadow.matched_account_holder_name
      else null
    end,
    case
      when linked.business_id is not null then 'linked_business'
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then 'exact_identifier_match'
      else 'document_extraction'
    end,
    case
      when linked.business_id is not null then 1::numeric
      when shadow.matched_business_id is not null
       and shadow.match_score>=95
       and shadow.reason_codes ? 'unique_exact_identifier_match'
        then least(shadow.match_score/100.0,1::numeric)
      else coalesce((o.field_confidences->>'receiver_name')::numeric,o.confidence_score,0)
    end,
    case
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
    shadow.match_strategy,
    shadow.match_score
  from public.operation_user_links l
  join public.operations o on o.id=l.operation_id
  left join lateral (
    select
      bol.business_id,
      bp.name as business_name,
      bpi.financial_account_id,
      bfa.account_holder_name
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
    select
      run.matched_business_id,
      bp.name as matched_business_name,
      run.matched_account_id,
      bfa.account_holder_name as matched_account_holder_name,
      run.match_score,
      run.match_strategy,
      coalesce(run.reason_codes,'[]'::jsonb) as reason_codes
    from public.operation_routing_shadow_runs run
    left join public.business_profiles bp on bp.id=run.matched_business_id
    left join public.business_financial_accounts bfa on bfa.id=run.matched_account_id
    where run.operation_id=o.id
      and run.status in ('high_confidence_match','probable_match')
    order by run.created_at desc,run.id desc
    limit 1
  ) shadow on true
  where l.user_id=(select auth.uid())
    and (p_relation_type is null or l.relation_type=p_relation_type)
    and (p_from is null or o.created_at>=p_from)
    and (p_to is null or o.created_at<p_to)
  order by greatest(o.created_at,l.last_seen_at) desc
  limit greatest(1,least(coalesce(p_limit,100),200))
  offset greatest(0,coalesce(p_offset,0));
$function$;

revoke all on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) to authenticated;

-- A token-based contract for the details screen. Visibility remains delegated to
-- get_operation_identity_projection, so no additional access path is introduced.
create or replace function public.get_operation_identity_by_token(p_public_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_operation_id uuid;
  v_projection jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select id into v_operation_id
  from public.operations
  where public_token=p_public_token;

  if v_operation_id is null then
    raise exception 'operation_not_found';
  end if;

  v_projection:=public.get_operation_identity_projection(array[v_operation_id]);
  if jsonb_array_length(coalesce(v_projection->'items','[]'::jsonb))=0 then
    raise exception 'operation_identity_access_denied' using errcode='42501';
  end if;

  return (v_projection->'items')->0;
end;
$function$;

revoke all on function public.get_operation_identity_by_token(uuid) from public,anon;
grant execute on function public.get_operation_identity_by_token(uuid) to authenticated;

comment on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) is
'User operation feed enriched with resolved business identity while retaining raw extracted names separately.';

commit;
