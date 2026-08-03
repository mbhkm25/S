-- Arabic personal names may be written with or without spaces inside common
-- compounds (for example عبدالله / عبد الله). Identity conflict detection must
-- ignore spacing after the standard financial-name normalization.

create or replace function private.operation_identity_name_conflict(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with source as (
    select
      o.receiver_name as raw_name,
      linked.account_holder_name as linked_account_holder_name,
      shadow.account_holder_name as shadow_account_holder_name,
      shadow.business_name as shadow_business_name
    from public.operations o
    left join lateral (
      select bfa.account_holder_name
      from public.business_operation_links bol
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
  ), resolved as (
    select raw_name,
      coalesce(linked_account_holder_name,shadow_account_holder_name,shadow_business_name) as trusted_name
    from source
  )
  select case
    when nullif(trim(coalesce(raw_name,'')),'') is null then false
    when nullif(trim(coalesce(trusted_name,'')),'') is null then false
    else regexp_replace(public.normalize_financial_name(raw_name),'\s+','','g')
      is distinct from regexp_replace(public.normalize_financial_name(trusted_name),'\s+','','g')
  end
  from resolved;
$function$;

comment on function private.operation_identity_name_conflict(uuid) is
'Compares extracted and resolved account-holder names after Arabic normalization and whitespace compaction, preventing false conflicts such as عبدالله versus عبد الله.';
