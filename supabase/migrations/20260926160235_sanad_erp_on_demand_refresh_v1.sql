-- Device-command transport only. No implicit browser/table access.
create table if not exists public.sanad_erp_refresh_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id),
  connection_id uuid not null references public.business_accounting_connections(id),
  source_instance_id uuid not null references public.business_erp_source_instances(id),
  bridge_device_id uuid not null references public.business_bridge_devices(id),
  requested_by uuid not null references auth.users(id),
  status text not null default 'requested'
    check (status in ('requested','claimed','completed','expired','failed')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  expires_at timestamptz not null default (now()+interval '45 minutes'),
  completed_at timestamptz,
  snapshot_public_id uuid,
  last_error_code text
);
alter table public.sanad_erp_refresh_requests enable row level security;
revoke all on public.sanad_erp_refresh_requests from public, anon, authenticated;
create index if not exists sanad_erp_refresh_requests_scope_idx
  on public.sanad_erp_refresh_requests (business_id,created_at desc);
