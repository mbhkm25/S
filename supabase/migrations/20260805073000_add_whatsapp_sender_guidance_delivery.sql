create table if not exists public.operation_sender_guidance_deliveries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  guidance_type text not null check (guidance_type in ('unmatched','analysis_failed')),
  recipient_phone text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  meta_message_id text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, guidance_type)
);

alter table public.operation_sender_guidance_deliveries enable row level security;
revoke all on public.operation_sender_guidance_deliveries from anon, authenticated;

create index if not exists operation_sender_guidance_status_idx
  on public.operation_sender_guidance_deliveries(status, created_at);

create or replace function private.claim_operation_sender_guidance(
  p_operation_id uuid,
  p_guidance_type text,
  p_recipient_phone text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.operation_sender_guidance_deliveries%rowtype;
begin
  if p_guidance_type not in ('unmatched','analysis_failed') then
    raise exception 'invalid_guidance_type';
  end if;

  insert into public.operation_sender_guidance_deliveries(
    operation_id, guidance_type, recipient_phone, status, attempt_count, claimed_at, metadata
  ) values (
    p_operation_id, p_guidance_type, regexp_replace(coalesce(p_recipient_phone,''),'\D','','g'),
    'sending', 1, now(), coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (operation_id, guidance_type) do update
    set status = 'sending',
        attempt_count = public.operation_sender_guidance_deliveries.attempt_count + 1,
        claimed_at = now(),
        recipient_phone = excluded.recipient_phone,
        metadata = public.operation_sender_guidance_deliveries.metadata || excluded.metadata,
        updated_at = now()
    where public.operation_sender_guidance_deliveries.status in ('pending','failed')
      and (
        public.operation_sender_guidance_deliveries.claimed_at is null
        or public.operation_sender_guidance_deliveries.claimed_at < now() - interval '10 minutes'
        or public.operation_sender_guidance_deliveries.status = 'failed'
      )
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed_or_sent');
  end if;

  return jsonb_build_object(
    'claimed', true,
    'delivery_id', v_row.id,
    'attempt_count', v_row.attempt_count,
    'status', v_row.status
  );
end;
$function$;

create or replace function private.complete_operation_sender_guidance(
  p_delivery_id uuid,
  p_status text,
  p_meta_message_id text default null,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_status not in ('sent','failed','skipped') then
    raise exception 'invalid_guidance_delivery_status';
  end if;

  update public.operation_sender_guidance_deliveries
  set status = p_status,
      sent_at = case when p_status='sent' then now() else sent_at end,
      meta_message_id = coalesce(p_meta_message_id, meta_message_id),
      last_error = p_error,
      metadata = metadata || coalesce(p_metadata,'{}'::jsonb),
      updated_at = now()
  where id = p_delivery_id;
end;
$function$;

revoke all on function private.claim_operation_sender_guidance(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.complete_operation_sender_guidance(uuid,text,text,text,jsonb) from public, anon, authenticated;
