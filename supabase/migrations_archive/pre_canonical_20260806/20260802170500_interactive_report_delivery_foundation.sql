begin;

alter table public.report_requests
  add column if not exists delivery_format text not null default 'interactive',
  add column if not exists interactive_report_id uuid,
  add column if not exists interactive_url text,
  add column if not exists pdf_status text,
  add column if not exists interactive_status text;

alter table public.report_requests
  drop constraint if exists report_requests_delivery_format_check,
  add constraint report_requests_delivery_format_check
    check (delivery_format in ('interactive','pdf','both'));

alter table public.report_requests
  drop constraint if exists report_requests_pdf_status_check,
  add constraint report_requests_pdf_status_check
    check (pdf_status is null or pdf_status in ('pending','processing','ready','failed','skipped'));

alter table public.report_requests
  drop constraint if exists report_requests_interactive_status_check,
  add constraint report_requests_interactive_status_check
    check (interactive_status is null or interactive_status in ('pending','ready','revoked','expired','failed','skipped'));

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_request_id uuid not null unique references public.report_requests(id) on delete cascade,
  requested_by_user_id uuid not null references public.profiles(id) on delete cascade,
  report_context text not null check (report_context in ('personal','business')),
  business_id uuid references public.business_profiles(id) on delete cascade,
  title text,
  date_from timestamptz,
  date_to timestamptz,
  report_scope text not null,
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters)='object'),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  operation_ids uuid[] not null default '{}'::uuid[],
  operations_count integer not null default 0 check (operations_count >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  operations_with_notes integer not null default 0 check (operations_with_notes >= 0),
  payload_version text not null default 'operations-v2',
  created_at timestamptz not null default now(),
  immutable_hash text
);

create table if not exists public.report_access_tokens (
  id uuid primary key default gen_random_uuid(),
  report_snapshot_id uuid not null references public.report_snapshots(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0)
);

create table if not exists public.report_access_events (
  id bigint generated always as identity primary key,
  report_snapshot_id uuid not null references public.report_snapshots(id) on delete cascade,
  access_token_id uuid references public.report_access_tokens(id) on delete set null,
  event_type text not null check (event_type in ('opened','filter_changed','pdf_requested','pdf_downloaded','operation_opened','document_opened','denied','expired')),
  operation_id uuid references public.operations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

create index if not exists report_snapshots_requested_by_idx on public.report_snapshots(requested_by_user_id, created_at desc);
create index if not exists report_access_tokens_snapshot_idx on public.report_access_tokens(report_snapshot_id, status, expires_at);
create index if not exists report_access_events_snapshot_idx on public.report_access_events(report_snapshot_id, created_at desc);

alter table public.report_snapshots enable row level security;
alter table public.report_access_tokens enable row level security;
alter table public.report_access_events enable row level security;

revoke all on public.report_snapshots from anon, authenticated;
revoke all on public.report_access_tokens from anon, authenticated;
revoke all on public.report_access_events from anon, authenticated;

grant select on public.report_snapshots to service_role;
grant select, insert, update, delete on public.report_access_tokens to service_role;
grant select, insert on public.report_access_events to service_role;

create or replace function public.get_interactive_report_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_token public.report_access_tokens%rowtype;
  v_snapshot public.report_snapshots%rowtype;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    return jsonb_build_object('ok',false,'error','invalid_token');
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_token
  from public.report_access_tokens
  where token_hash = v_hash
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if v_token.status <> 'active' then
    return jsonb_build_object('ok',false,'error',v_token.status);
  end if;

  if v_token.expires_at <= now() then
    update public.report_access_tokens set status='expired' where id=v_token.id;
    return jsonb_build_object('ok',false,'error','expired');
  end if;

  select * into v_snapshot from public.report_snapshots where id=v_token.report_snapshot_id;

  update public.report_access_tokens
    set last_accessed_at=now(), access_count=access_count+1
  where id=v_token.id;

  insert into public.report_access_events(report_snapshot_id, access_token_id, event_type)
  values (v_snapshot.id, v_token.id, 'opened');

  return jsonb_build_object(
    'ok', true,
    'report_snapshot_id', v_snapshot.id,
    'report_request_id', v_snapshot.report_request_id,
    'title', v_snapshot.title,
    'date_from', v_snapshot.date_from,
    'date_to', v_snapshot.date_to,
    'report_context', v_snapshot.report_context,
    'business_id', v_snapshot.business_id,
    'filters', v_snapshot.filters,
    'payload', v_snapshot.payload,
    'operations_count', v_snapshot.operations_count,
    'verified_count', v_snapshot.verified_count,
    'operations_with_notes', v_snapshot.operations_with_notes,
    'expires_at', v_token.expires_at
  );
end;
$$;

revoke all on function public.get_interactive_report_by_token(text) from public;
grant execute on function public.get_interactive_report_by_token(text) to service_role;

comment on column public.report_requests.delivery_format is 'Requested delivery mode: interactive link, PDF document, or both.';
comment on table public.report_snapshots is 'Immutable report payload shared by interactive and PDF renderers.';
comment on table public.report_access_tokens is 'Hashed, expiring access credentials for interactive report links.';
comment on table public.report_access_events is 'Append-only audit trail for interactive report usage.';

commit;
