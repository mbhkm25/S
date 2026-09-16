create table if not exists public.ai_cost_policy (
  id smallint primary key default 1 check (id=1),
  monthly_budget_usd numeric(12,2) not null default 25.00,
  production_unit_cost_warn_usd numeric(12,6) not null default 0.005000,
  production_unit_cost_critical_usd numeric(12,6) not null default 0.010000,
  nonproduction_daily_budget_usd numeric(12,2) not null default 1.00,
  benchmark_requires_explicit_enable boolean not null default true,
  shadow_requires_explicit_enable boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.ai_cost_policy(id) values (1) on conflict do nothing;
alter table public.ai_cost_policy enable row level security;
revoke all on public.ai_cost_policy from anon, authenticated;

create or replace view public.ai_cost_health as
with m as (
  select coalesce(sum(estimated_cost_usd),0) month_cost,
         coalesce(avg(estimated_cost_usd) filter(where purpose='operation_analysis' and status='completed'),0) avg_operation_cost,
         count(*) filter(where purpose='operation_analysis' and status='completed') operation_calls,
         coalesce(sum(estimated_cost_usd) filter(where purpose <> 'operation_analysis'),0) non_operation_cost
  from public.ai_usage_ledger
  where occurred_at >= date_trunc('month',now())
), p as (select * from public.ai_cost_policy where id=1)
select m.month_cost,m.avg_operation_cost,m.operation_calls,m.non_operation_cost,
       p.monthly_budget_usd,p.production_unit_cost_warn_usd,p.production_unit_cost_critical_usd,
       case when m.avg_operation_cost >= p.production_unit_cost_critical_usd then 'critical'
            when m.avg_operation_cost >= p.production_unit_cost_warn_usd then 'warning'
            else 'healthy' end as unit_cost_status,
       case when m.month_cost >= p.monthly_budget_usd then 'critical'
            when m.month_cost >= p.monthly_budget_usd*0.8 then 'warning'
            else 'healthy' end as monthly_budget_status
from m cross join p;
revoke all on public.ai_cost_health from anon, authenticated;
