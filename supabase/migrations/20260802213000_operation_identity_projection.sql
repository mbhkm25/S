begin;

create or replace function public.get_operation_identity_projection(
  p_operation_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_operation_ids is null or cardinality(p_operation_ids) = 0 then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;

  with requested as (
    select distinct unnest(p_operation_ids) as operation_id
  ), visible as (
    select r.operation_id
    from requested r
    where exists (
      select 1
      from public.operation_user_links oul
      where oul.operation_id = r.operation_id
        and oul.user_id = v_uid
    )
    or exists (
      select 1
      from public.business_operation_links bol
      join public.business_profiles bp on bp.id = bol.business_id
      where bol.operation_id = r.operation_id
        and bol.status = 'linked'
        and (
          bp.owner_user_id = v_uid
          or exists (
            select 1
            from public.business_team_members btm
            where btm.business_id = bp.id
              and btm.user_id = v_uid
              and btm.status = 'active'
          )
        )
    )
  ), resolved as (
    select
      o.id as operation_id,
      o.receiver_name as raw_receiver_name,
      o.sender_name as raw_sender_name,
      o.receiver_name_normalized,
      o.sender_name_normalized,
      o.receiver_account,
      o.merchant_point,
      o.financial_entity,
      o.financial_entity_code,
      o.field_confidences,
      o.field_evidence,
      linked.business_id as linked_business_id,
      linked.business_name as linked_business_name,
      linked.financial_account_id as linked_financial_account_id,
      linked.account_holder_name as linked_account_holder_name,
      shadow.matched_business_id,
      shadow.matched_business_name,
      shadow.matched_account_id,
      shadow.matched_account_holder_name,
      shadow.match_score,
      shadow.match_strategy,
      shadow.reason_codes,
      case
        when linked.business_id is not null then 'linked_business'
        when shadow.matched_business_id is not null
          and shadow.match_score >= 95
          and shadow.reason_codes ? 'unique_exact_identifier_match'
          then 'exact_identifier_match'
        else 'document_extraction'
      end as identity_source,
      case
        when linked.business_id is not null then linked.business_name
        when shadow.matched_business_id is not null
          and shadow.match_score >= 95
          and shadow.reason_codes ? 'unique_exact_identifier_match'
          then shadow.matched_business_name
        else null
      end as resolved_business_name,
      case
        when linked.financial_account_id is not null then linked.account_holder_name
        when shadow.matched_account_id is not null
          and shadow.match_score >= 95
          and shadow.reason_codes ? 'unique_exact_identifier_match'
          then shadow.matched_account_holder_name
        else null
      end as resolved_account_holder_name,
      case
        when linked.business_id is not null then 1::numeric
        when shadow.matched_business_id is not null
          and shadow.match_score >= 95
          and shadow.reason_codes ? 'unique_exact_identifier_match'
          then least(shadow.match_score / 100.0, 1::numeric)
        else coalesce((o.field_confidences ->> 'receiver_name')::numeric, o.confidence_score, 0)
      end as identity_confidence,
      case
        when linked.business_id is not null then false
        when shadow.matched_business_id is not null
          and shadow.match_score >= 95
          and shadow.reason_codes ? 'unique_exact_identifier_match'
          and nullif(trim(coalesce(o.receiver_name, '')), '') is not null
          and public.normalize_financial_name(o.receiver_name)
              is distinct from public.normalize_financial_name(shadow.matched_business_name)
          then true
        else false
      end as has_name_conflict
    from visible v
    join public.operations o on o.id = v.operation_id
    left join lateral (
      select
        bol.business_id,
        bp.name as business_name,
        bpi.financial_account_id,
        bfa.account_holder_name
      from public.business_operation_links bol
      join public.business_profiles bp on bp.id = bol.business_id
      left join public.business_payment_inbox bpi
        on bpi.business_id = bol.business_id
       and bpi.operation_id = bol.operation_id
      left join public.business_financial_accounts bfa
        on bfa.id = bpi.financial_account_id
      where bol.operation_id = o.id
        and bol.status = 'linked'
      order by bol.updated_at desc, bol.id desc
      limit 1
    ) linked on true
    left join lateral (
      select
        ors.matched_business_id,
        bp.name as matched_business_name,
        ors.matched_account_id,
        bfa.account_holder_name as matched_account_holder_name,
        ors.match_score,
        ors.match_strategy,
        coalesce(ors.reason_codes, '[]'::jsonb) as reason_codes
      from public.operation_routing_shadow_runs ors
      left join public.business_profiles bp on bp.id = ors.matched_business_id
      left join public.business_financial_accounts bfa on bfa.id = ors.matched_account_id
      where ors.operation_id = o.id
        and ors.status in ('high_confidence_match', 'probable_match')
      order by ors.created_at desc, ors.id desc
      limit 1
    ) shadow on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'operation_id', r.operation_id,
    'raw_receiver_name', r.raw_receiver_name,
    'raw_sender_name', r.raw_sender_name,
    'receiver_name_normalized', r.receiver_name_normalized,
    'sender_name_normalized', r.sender_name_normalized,
    'receiver_account', r.receiver_account,
    'merchant_point', r.merchant_point,
    'financial_entity', r.financial_entity,
    'financial_entity_code', r.financial_entity_code,
    'linked_business_id', r.linked_business_id,
    'linked_business_name', r.linked_business_name,
    'linked_financial_account_id', r.linked_financial_account_id,
    'matched_business_id', r.matched_business_id,
    'matched_business_name', r.matched_business_name,
    'matched_account_id', r.matched_account_id,
    'resolved_business_name', r.resolved_business_name,
    'resolved_account_holder_name', r.resolved_account_holder_name,
    'identity_source', r.identity_source,
    'identity_confidence', r.identity_confidence,
    'has_name_conflict', r.has_name_conflict,
    'match_score', r.match_score,
    'match_strategy', r.match_strategy,
    'reason_codes', r.reason_codes,
    'field_confidences', coalesce(r.field_confidences, '{}'::jsonb),
    'field_evidence', coalesce(r.field_evidence, '{}'::jsonb)
  ) order by r.operation_id), '[]'::jsonb)
  into v_items
  from resolved r;

  return jsonb_build_object('items', v_items);
end;
$function$;

revoke all on function public.get_operation_identity_projection(uuid[]) from public;
grant execute on function public.get_operation_identity_projection(uuid[]) to authenticated;

comment on function public.get_operation_identity_projection(uuid[]) is
'Provides a single identity projection for operation UI. Linked business identity wins, then unique exact identifier matches, while raw extracted names remain separate.';

commit;
