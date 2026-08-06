-- SANAD business payment inbox: read-only shadow preview.
-- This exposes only the latest matched shadow run for businesses the current user
-- can already view in the payment inbox. It never creates an inbox item or link.

create index if not exists idx_operation_routing_shadow_runs_business_preview
  on public.operation_routing_shadow_runs (matched_business_id, created_at desc, id desc)
  where matched_business_id is not null
    and analysis_contract_version >= 2
    and status in ('high_confidence_match', 'probable_match');

create or replace function public.get_business_payment_shadow_preview(
  p_business_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_has_more boolean;
  v_next_created timestamptz;
  v_next_id uuid;
begin
  if not private.has_business_payment_permission(p_business_id, 'view', auth.uid()) then
    raise exception 'payment_inbox_view_required' using errcode = '42501';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid_payment_inbox_cursor';
  end if;

  with latest_runs as (
    select distinct on (s.operation_id)
      s.*
    from public.operation_routing_shadow_runs s
    where s.matched_business_id = p_business_id
      and s.analysis_contract_version >= 2
    order by s.operation_id, s.created_at desc, s.id desc
  ), rows as (
    select
      s.id,
      s.operation_id,
      s.matched_business_id as business_id,
      s.matched_account_id as financial_account_id,
      s.status as shadow_status,
      s.match_score,
      s.match_strategy,
      s.reason_codes,
      s.created_at,
      o.public_token,
      o.amount,
      o.currency,
      o.financial_entity,
      o.financial_entity_code,
      o.receiver_name,
      o.receiver_account,
      o.merchant_point,
      o.reference_number,
      o.transaction_datetime,
      bp.name as business_name,
      fa.account_label,
      fa.account_holder_name,
      d.decision_status,
      d.gate_reasons
    from latest_runs s
    join public.operations o on o.id = s.operation_id
    join public.business_profiles bp on bp.id = s.matched_business_id
    left join public.business_financial_accounts fa on fa.id = s.matched_account_id
    left join lateral (
      select rd.decision_status, rd.gate_reasons
      from public.financial_routing_rollout_decisions rd
      where rd.shadow_run_id = s.id
      order by rd.last_evaluated_at desc, rd.id desc
      limit 1
    ) d on true
    where s.status in ('high_confidence_match', 'probable_match')
      and s.matched_account_id is not null
      and not exists (
        select 1
        from public.business_payment_inbox i
        where i.operation_id = s.operation_id
          and i.business_id = p_business_id
      )
      and (
        p_before_created_at is null
        or (s.created_at, s.id) < (p_before_created_at, p_before_id)
      )
    order by s.created_at desc, s.id desc
    limit v_limit + 1
  ), numbered as (
    select *, row_number() over (order by created_at desc, id desc) as rn
    from rows
  ), page as (
    select * from numbered where rn <= v_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'business_id', p.business_id,
          'business_name', p.business_name,
          'operation_id', p.operation_id,
          'public_token', p.public_token,
          'status', 'shadow_preview',
          'source_mode', 'shadow',
          'operational', false,
          'priority', 0,
          'shadow_status', p.shadow_status,
          'match_score', p.match_score,
          'match_strategy', p.match_strategy,
          'reason_codes', p.reason_codes,
          'decision_status', p.decision_status,
          'gate_reasons', p.gate_reasons,
          'amount', p.amount,
          'currency', p.currency,
          'financial_entity', p.financial_entity,
          'financial_entity_code', p.financial_entity_code,
          'receiver_name', p.receiver_name,
          'receiver_account', p.receiver_account,
          'merchant_point', p.merchant_point,
          'reference_number', p.reference_number,
          'transaction_datetime', p.transaction_datetime,
          'financial_account_id', p.financial_account_id,
          'account_label', p.account_label,
          'account_holder_name', p.account_holder_name,
          'claimed_by_user_id', null,
          'claimed_by_name', null,
          'claimed_at', null,
          'claim_expires_at', null,
          'completed_at', null,
          'created_at', p.created_at,
          'updated_at', p.created_at,
          'row_version', 0
        )
        order by p.created_at desc, p.id desc
      ),
      '[]'::jsonb
    ),
    exists(select 1 from numbered where rn = v_limit + 1),
    (select created_at from page order by created_at asc, id asc limit 1),
    (select id from page order by created_at asc, id asc limit 1)
  into v_items, v_has_more, v_next_created, v_next_id
  from page p;

  return jsonb_build_object(
    'items', v_items,
    'has_more', coalesce(v_has_more, false),
    'next_cursor', case
      when v_has_more then jsonb_build_object('created_at', v_next_created, 'id', v_next_id)
      else null
    end,
    'permissions', jsonb_build_object(
      'claim', false,
      'complete', false,
      'release', false,
      'reassign', false,
      'review', false,
      'preview', true
    )
  );
end;
$$;

revoke all on function public.get_business_payment_shadow_preview(uuid, integer, timestamptz, uuid) from public;
revoke all on function public.get_business_payment_shadow_preview(uuid, integer, timestamptz, uuid) from anon;
grant execute on function public.get_business_payment_shadow_preview(uuid, integer, timestamptz, uuid) to authenticated;

comment on function public.get_business_payment_shadow_preview(uuid, integer, timestamptz, uuid)
is 'Read-only business-scoped preview of matched shadow routing runs. Never creates operational inbox items or business links.';
