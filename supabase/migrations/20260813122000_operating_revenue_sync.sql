begin;

create or replace function public.sync_pro_payment_operating_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and new.user_id is not null
     and new.expected_amount is not null
     and nullif(trim(new.expected_currency),'') is not null then
    perform public.service_record_operating_revenue(
      new.user_id,
      coalesce(new.approved_at,new.updated_at,new.created_at,now()),
      new.expected_amount,
      new.expected_currency,
      null,
      'pro_payment_request',
      new.id::text,
      jsonb_build_object(
        'plan_code',new.plan_code,
        'months',new.months,
        'purchase_scope',new.purchase_scope,
        'business_id',new.business_id,
        'synced_from_status','approved'
      )
    );
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    delete from public.operating_revenue_events
    where source_type = 'pro_payment_request'
      and source_id = new.id::text;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_pro_payment_operating_revenue() from public, anon, authenticated;

drop trigger if exists trg_sync_pro_payment_operating_revenue on public.pro_payment_requests;
create trigger trg_sync_pro_payment_operating_revenue
after insert or update of status, expected_amount, expected_currency, approved_at, user_id
on public.pro_payment_requests
for each row
execute function public.sync_pro_payment_operating_revenue();

create or replace view public.user_monthly_unit_economics_extended
with (security_invoker = true)
as
select
  e.*,
  case when e.operations_count > 0 then round(e.ai_cost_usd / e.operations_count, 8) else 0::numeric end as ai_cost_per_operation_usd,
  case when e.operations_count > 0 then round(e.total_operating_cost_usd / e.operations_count, 8) else 0::numeric end as total_cost_per_operation_usd,
  case when e.ai_requests > 0 then round(e.ai_cost_usd / e.ai_requests, 8) else 0::numeric end as ai_cost_per_request_usd
from public.user_monthly_unit_economics e;

revoke all on public.user_monthly_unit_economics_extended from anon, authenticated;

commit;