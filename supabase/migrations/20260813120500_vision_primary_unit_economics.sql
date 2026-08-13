begin;

create table if not exists public.analysis_runtime_config (
  config_key text primary key,
  engine_kind text not null,
  gateway_function text not null,
  analyzer_function text not null,
  model text not null,
  input_mode text not null,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint analysis_runtime_config_input_mode_check check (input_mode in ('vision_direct','text_only','hybrid'))
);

insert into public.analysis_runtime_config (
  config_key, engine_kind, gateway_function, analyzer_function, model, input_mode, is_primary, metadata, updated_at
) values (
  'operation_analysis_primary',
  'gemini_vision',
  'sanad-operation-analysis-primary',
  'sanad-operation-analysis-shadow',
  'gemini-3.5-flash-lite',
  'vision_direct',
  true,
  jsonb_build_object(
    'decision','adopted_as_primary',
    'ocr_required',false,
    'fallback_function','sanad-v3-analyze-operation',
    'note','Primary and fallback both read the original image/document directly; OCR canaries are not in the production routing path.'
  ),
  now()
)
on conflict (config_key) do update set
  engine_kind = excluded.engine_kind,
  gateway_function = excluded.gateway_function,
  analyzer_function = excluded.analyzer_function,
  model = excluded.model,
  input_mode = excluded.input_mode,
  is_primary = excluded.is_primary,
  metadata = excluded.metadata,
  updated_at = now();

create table if not exists public.operating_cost_periods (
  period_start date primary key,
  supabase_cost_usd numeric(14,6) not null default 0 check (supabase_cost_usd >= 0),
  infrastructure_cost_usd numeric(14,6) not null default 0 check (infrastructure_cost_usd >= 0),
  other_fixed_cost_usd numeric(14,6) not null default 0 check (other_fixed_cost_usd >= 0),
  allocation_method text not null default 'operation_count',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operating_cost_period_first_day_check check (period_start = date_trunc('month', period_start::timestamp)::date),
  constraint operating_cost_allocation_method_check check (allocation_method in ('operation_count'))
);

insert into public.operating_cost_periods (
  period_start, supabase_cost_usd, infrastructure_cost_usd, other_fixed_cost_usd, allocation_method, notes, metadata
) values (
  date_trunc('month', now())::date,
  30.00,
  100.00,
  0.00,
  'operation_count',
  'Initial SANAD monthly fixed-cost baseline supplied by project owner.',
  jsonb_build_object('baseline_total_usd',130.00,'provisional',true)
)
on conflict (period_start) do nothing;

create table if not exists public.operating_revenue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  amount numeric(18,4) not null check (amount >= 0),
  currency text not null,
  amount_usd numeric(18,6) check (amount_usd is null or amount_usd >= 0),
  source_type text not null,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists operating_revenue_events_source_uidx
  on public.operating_revenue_events(source_type, source_id)
  where source_id is not null;
create index if not exists operating_revenue_events_user_time_idx
  on public.operating_revenue_events(user_id, occurred_at desc);

alter table public.analysis_runtime_config enable row level security;
alter table public.operating_cost_periods enable row level security;
alter table public.operating_revenue_events enable row level security;

revoke all on public.analysis_runtime_config from anon, authenticated;
revoke all on public.operating_cost_periods from anon, authenticated;
revoke all on public.operating_revenue_events from anon, authenticated;

drop view if exists public.ai_usage_user_attributed;
create view public.ai_usage_user_attributed
with (security_invoker = true)
as
select
  a.id as ai_usage_id,
  a.occurred_at,
  a.request_id,
  a.operation_id,
  coalesce(o.submitted_by_user_id, uploader.user_id) as user_id,
  case
    when o.submitted_by_user_id is not null then 'operations.submitted_by_user_id'
    when uploader.user_id is not null then 'operation_user_links.uploader'
    else 'unattributed'
  end as attribution_source,
  a.source,
  a.purpose,
  a.environment,
  a.model,
  a.billing_mode,
  a.status,
  a.prompt_tokens,
  a.cached_tokens,
  a.candidate_tokens,
  a.thinking_tokens,
  a.billed_output_tokens,
  a.total_tokens,
  a.input_cost_usd,
  a.cached_input_cost_usd,
  a.output_cost_usd,
  a.estimated_cost_usd,
  a.latency_ms,
  a.usage_metadata,
  a.metadata
from public.ai_usage_ledger a
left join public.operations o on o.id = a.operation_id
left join lateral (
  select l.user_id
  from public.operation_user_links l
  where l.operation_id = a.operation_id
    and l.relation_type = 'uploader'
    and l.user_id is not null
  order by l.first_seen_at asc, l.created_at asc
  limit 1
) uploader on true;

revoke all on public.ai_usage_user_attributed from anon, authenticated;

create or replace view public.user_monthly_unit_economics
with (security_invoker = true)
as
with attributed_operations as (
  select
    o.id as operation_id,
    coalesce(o.submitted_by_user_id, uploader.user_id) as user_id,
    date_trunc('month', o.created_at)::date as period_start
  from public.operations o
  left join lateral (
    select l.user_id
    from public.operation_user_links l
    where l.operation_id = o.id
      and l.relation_type = 'uploader'
      and l.user_id is not null
    order by l.first_seen_at asc, l.created_at asc
    limit 1
  ) uploader on true
  where coalesce(o.submitted_by_user_id, uploader.user_id) is not null
), operation_counts as (
  select period_start, user_id, count(*)::bigint as operations_count
  from attributed_operations
  group by period_start, user_id
), platform_operation_counts as (
  select period_start, count(*)::bigint as platform_operations_count
  from attributed_operations
  group by period_start
), ai as (
  select
    date_trunc('month', occurred_at)::date as period_start,
    user_id,
    count(*)::bigint as ai_requests,
    coalesce(sum(prompt_tokens),0)::bigint as prompt_tokens,
    coalesce(sum(cached_tokens),0)::bigint as cached_tokens,
    coalesce(sum(billed_output_tokens),0)::bigint as output_tokens,
    coalesce(sum(total_tokens),0)::bigint as total_tokens,
    coalesce(sum(estimated_cost_usd),0)::numeric(18,6) as ai_cost_usd
  from public.ai_usage_user_attributed
  where user_id is not null
  group by 1,2
), revenue as (
  select
    date_trunc('month', occurred_at)::date as period_start,
    user_id,
    coalesce(sum(amount_usd),0)::numeric(18,6) as revenue_usd,
    count(*) filter (where amount_usd is null)::bigint as revenue_events_missing_usd,
    jsonb_object_agg(currency, currency_total) filter (where currency is not null) as revenue_by_currency
  from (
    select period_start_source.occurred_at, period_start_source.user_id, period_start_source.currency,
           period_start_source.amount_usd,
           sum(period_start_source.amount) over (partition by date_trunc('month', period_start_source.occurred_at), period_start_source.user_id, period_start_source.currency) as currency_total
    from public.operating_revenue_events period_start_source
  ) r
  group by 1,2
), keys as (
  select period_start, user_id from operation_counts
  union
  select period_start, user_id from ai
  union
  select period_start, user_id from revenue
)
select
  k.period_start,
  k.user_id,
  p.full_name,
  p.phone,
  coalesce(oc.operations_count,0)::bigint as operations_count,
  coalesce(ai.ai_requests,0)::bigint as ai_requests,
  coalesce(ai.prompt_tokens,0)::bigint as ai_prompt_tokens,
  coalesce(ai.cached_tokens,0)::bigint as ai_cached_tokens,
  coalesce(ai.output_tokens,0)::bigint as ai_output_tokens,
  coalesce(ai.total_tokens,0)::bigint as ai_total_tokens,
  coalesce(ai.ai_cost_usd,0)::numeric(18,6) as ai_cost_usd,
  coalesce(pc.platform_operations_count,0)::bigint as platform_operations_count,
  coalesce(cp.supabase_cost_usd,0)::numeric(18,6) as platform_supabase_cost_usd,
  coalesce(cp.infrastructure_cost_usd,0)::numeric(18,6) as platform_infrastructure_cost_usd,
  coalesce(cp.other_fixed_cost_usd,0)::numeric(18,6) as platform_other_fixed_cost_usd,
  case when coalesce(pc.platform_operations_count,0) > 0
    then round((coalesce(cp.supabase_cost_usd,0) + coalesce(cp.infrastructure_cost_usd,0) + coalesce(cp.other_fixed_cost_usd,0))
      * coalesce(oc.operations_count,0)::numeric / pc.platform_operations_count::numeric, 6)
    else 0::numeric
  end as allocated_fixed_cost_usd,
  round(
    coalesce(ai.ai_cost_usd,0) +
    case when coalesce(pc.platform_operations_count,0) > 0
      then (coalesce(cp.supabase_cost_usd,0) + coalesce(cp.infrastructure_cost_usd,0) + coalesce(cp.other_fixed_cost_usd,0))
        * coalesce(oc.operations_count,0)::numeric / pc.platform_operations_count::numeric
      else 0::numeric
    end,
    6
  ) as total_operating_cost_usd,
  coalesce(rev.revenue_usd,0)::numeric(18,6) as revenue_usd,
  coalesce(rev.revenue_events_missing_usd,0)::bigint as revenue_events_missing_usd,
  coalesce(rev.revenue_by_currency,'{}'::jsonb) as revenue_by_currency,
  round(
    coalesce(rev.revenue_usd,0) -
    (coalesce(ai.ai_cost_usd,0) +
      case when coalesce(pc.platform_operations_count,0) > 0
        then (coalesce(cp.supabase_cost_usd,0) + coalesce(cp.infrastructure_cost_usd,0) + coalesce(cp.other_fixed_cost_usd,0))
          * coalesce(oc.operations_count,0)::numeric / pc.platform_operations_count::numeric
        else 0::numeric
      end),
    6
  ) as contribution_profit_usd,
  case when coalesce(rev.revenue_usd,0) > 0
    then round(100 * (coalesce(rev.revenue_usd,0) -
      (coalesce(ai.ai_cost_usd,0) +
        case when coalesce(pc.platform_operations_count,0) > 0
          then (coalesce(cp.supabase_cost_usd,0) + coalesce(cp.infrastructure_cost_usd,0) + coalesce(cp.other_fixed_cost_usd,0))
            * coalesce(oc.operations_count,0)::numeric / pc.platform_operations_count::numeric
          else 0::numeric
        end)) / rev.revenue_usd, 2)
    else null
  end as contribution_margin_pct
from keys k
left join public.profiles p on p.id = k.user_id
left join operation_counts oc on oc.period_start = k.period_start and oc.user_id = k.user_id
left join platform_operation_counts pc on pc.period_start = k.period_start
left join ai on ai.period_start = k.period_start and ai.user_id = k.user_id
left join revenue rev on rev.period_start = k.period_start and rev.user_id = k.user_id
left join public.operating_cost_periods cp on cp.period_start = k.period_start;

revoke all on public.user_monthly_unit_economics from anon, authenticated;

create or replace function public.service_record_operating_revenue(
  p_user_id uuid,
  p_occurred_at timestamptz,
  p_amount numeric,
  p_currency text,
  p_amount_usd numeric,
  p_source_type text,
  p_source_id text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then raise exception 'user_id_required'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount'; end if;
  if nullif(trim(p_currency),'') is null then raise exception 'currency_required'; end if;
  if nullif(trim(p_source_type),'') is null then raise exception 'source_type_required'; end if;

  insert into public.operating_revenue_events(user_id, occurred_at, amount, currency, amount_usd, source_type, source_id, metadata)
  values (p_user_id, coalesce(p_occurred_at,now()), p_amount, upper(trim(p_currency)), p_amount_usd, trim(p_source_type), nullif(trim(p_source_id),''), coalesce(p_metadata,'{}'::jsonb))
  on conflict (source_type, source_id) where source_id is not null
  do update set
    user_id = excluded.user_id,
    occurred_at = excluded.occurred_at,
    amount = excluded.amount,
    currency = excluded.currency,
    amount_usd = coalesce(excluded.amount_usd, public.operating_revenue_events.amount_usd),
    metadata = public.operating_revenue_events.metadata || excluded.metadata
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.service_record_operating_revenue(uuid,timestamptz,numeric,text,numeric,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.service_record_operating_revenue(uuid,timestamptz,numeric,text,numeric,text,text,jsonb) to service_role;

insert into public.operating_revenue_events(user_id, occurred_at, amount, currency, amount_usd, source_type, source_id, metadata)
select
  r.user_id,
  coalesce(r.approved_at,r.updated_at,r.created_at),
  r.expected_amount,
  upper(r.expected_currency),
  null,
  'pro_payment_request',
  r.id::text,
  jsonb_build_object('plan_code',r.plan_code,'months',r.months,'backfilled',true)
from public.pro_payment_requests r
where r.status = 'approved'
  and r.user_id is not null
  and r.expected_amount is not null
on conflict (source_type, source_id) where source_id is not null do nothing;

commit;