create table if not exists public.operation_file_access_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  user_id uuid not null,
  purpose text not null check (purpose in ('open','download')),
  outcome text not null check (outcome in ('granted','denied','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.operation_file_access_events enable row level security;
revoke all on table public.operation_file_access_events from public, anon, authenticated;
grant select, insert on table public.operation_file_access_events to service_role;

create index if not exists idx_operation_file_access_events_operation_created
  on public.operation_file_access_events(operation_id, created_at desc);
create index if not exists idx_operation_file_access_events_user_created
  on public.operation_file_access_events(user_id, created_at desc);
