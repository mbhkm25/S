begin;

create table if not exists public.sanad_runtime_flags (
  flag_key text primary key,
  enabled boolean not null default false,
  sample_percent smallint not null default 0 check (sample_percent between 0 and 100),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sanad_runtime_flags enable row level security;

insert into public.sanad_runtime_flags (flag_key, enabled, sample_percent, config)
values (
  'operational_shadow',
  false,
  0,
  jsonb_build_object(
    'description', 'Runs the operational analysis shadow pipeline without mutating operations or payment inbox.',
    'engine_version', 'operational-shadow-v8'
  )
)
on conflict (flag_key) do nothing;

create or replace function public.service_should_run_operational_shadow(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      f.enabled
      and f.sample_percent > 0
      and mod(abs(hashtextextended(p_operation_id::text, 0)), 100) < f.sample_percent
    from public.sanad_runtime_flags f
    where f.flag_key = 'operational_shadow'
  ), false);
$$;

comment on function public.service_should_run_operational_shadow(uuid)
is 'Internal deterministic sampling gate for the operational shadow pipeline.';

revoke all on table public.sanad_runtime_flags from public, anon, authenticated;
grant select on table public.sanad_runtime_flags to service_role;
revoke all on function public.service_should_run_operational_shadow(uuid) from public, anon, authenticated;
grant execute on function public.service_should_run_operational_shadow(uuid) to service_role;

commit;
