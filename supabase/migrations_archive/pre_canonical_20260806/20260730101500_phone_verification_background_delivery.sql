begin;

insert into private.sanad_worker_tokens(worker_name, token_value, is_active, created_at, updated_at)
values (
  'phone_verification_delivery',
  encode(extensions.gen_random_bytes(32), 'hex'),
  true,
  now(),
  now()
)
on conflict (worker_name) do update
set is_active = true,
    updated_at = now();

create or replace function public.verify_sanad_worker_token(
  p_worker_name text,
  p_token text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    extensions.digest(convert_to(t.token_value, 'UTF8'), 'sha256') =
    extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'),
    false
  )
  into v_valid
  from private.sanad_worker_tokens t
  where t.worker_name = trim(coalesce(p_worker_name, ''))
    and t.is_active = true;

  return coalesce(v_valid, false);
end;
$$;

revoke all on function public.verify_sanad_worker_token(text,text) from public, anon, authenticated;
grant execute on function public.verify_sanad_worker_token(text,text) to service_role;

create or replace function private.dispatch_phone_verification_delivery()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_request bigint;
begin
  select token_value
  into v_token
  from private.sanad_worker_tokens
  where worker_name = 'phone_verification_delivery'
    and is_active = true;

  if v_token is null then
    return null;
  end if;

  select net.http_post(
    url := 'https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-phone-verification',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sanad-worker-token', v_token
    ),
    body := jsonb_build_object(
      'limit', 10,
      'source', 'database_dispatch'
    ),
    timeout_milliseconds := 20000
  )
  into v_request;

  return v_request;
end;
$$;

revoke all on function private.dispatch_phone_verification_delivery() from public, anon, authenticated;

create or replace function public.retry_my_phone_verification()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim public.phone_verification_claims%rowtype;
  v_new_claim_id uuid;
  v_last_request timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select *
  into v_claim
  from public.phone_verification_claims
  where user_id = v_user_id
  order by created_at desc
  limit 1
  for update;

  if v_claim.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_claim');
  end if;

  if v_claim.status in ('verified', 'conflict') then
    return jsonb_build_object('ok', false, 'reason', v_claim.status, 'claim_id', v_claim.id);
  end if;

  v_last_request := greatest(v_claim.requested_at, coalesce(v_claim.sent_at, '-infinity'::timestamptz));
  if v_last_request > now() - interval '60 seconds' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from ((v_last_request + interval '60 seconds') - now())))::integer),
      'claim_id', v_claim.id
    );
  end if;

  if v_claim.status = 'sending' and v_claim.claimed_at >= now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'already_sending', 'claim_id', v_claim.id);
  end if;

  if v_claim.expires_at > now() and v_claim.delivery_attempts < 3 then
    update public.phone_verification_claims
    set status = 'queued',
        claimed_at = null,
        sent_at = null,
        whatsapp_message_id = null,
        response_token_hash = null,
        last_error = null,
        requested_at = now(),
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'manual_retry_at', now(),
          'manual_retry_source', 'retry_my_phone_verification'
        )
    where id = v_claim.id;

    insert into public.phone_verification_events(claim_id,user_id,event_type,metadata)
    values (v_claim.id,v_user_id,'manual_retry_queued',jsonb_build_object('previous_status',v_claim.status));

    perform private.dispatch_phone_verification_delivery();
    return jsonb_build_object('ok', true, 'status', 'queued', 'claim_id', v_claim.id);
  end if;

  if v_claim.status in ('queued','sending','sent','conflict') then
    update public.phone_verification_claims
    set status = case when status = 'conflict' then status else 'expired' end,
        updated_at = now()
    where id = v_claim.id;
  end if;

  insert into public.phone_verification_claims(
    user_id,
    phone_normalized,
    status,
    expires_at,
    requested_at,
    metadata
  ) values (
    v_user_id,
    v_claim.phone_normalized,
    'queued',
    now() + interval '30 minutes',
    now(),
    jsonb_build_object(
      'source', 'manual_retry',
      'retry_of_claim_id', v_claim.id
    )
  ) returning id into v_new_claim_id;

  insert into public.phone_verification_events(claim_id,user_id,event_type,metadata)
  values (v_new_claim_id,v_user_id,'manual_retry_created',jsonb_build_object('retry_of_claim_id',v_claim.id));

  perform private.dispatch_phone_verification_delivery();
  return jsonb_build_object('ok', true, 'status', 'queued', 'claim_id', v_new_claim_id);
end;
$$;

revoke all on function public.retry_my_phone_verification() from public, anon;
grant execute on function public.retry_my_phone_verification() to authenticated;

-- Ensure registration no longer depends on the browser to start delivery.
create or replace function private.queue_phone_verification_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.dispatch_phone_verification_delivery();
  return new;
exception when others then
  -- Claim creation must never fail because the async dispatcher is unavailable.
  return new;
end;
$$;

drop trigger if exists trg_phone_verification_dispatch on public.phone_verification_claims;
create trigger trg_phone_verification_dispatch
after insert on public.phone_verification_claims
for each row
when (new.status = 'queued')
execute function private.queue_phone_verification_dispatch();

-- Keep a minute-level safety dispatcher for transient pg_net or trigger failures.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'sanad-phone-verification-delivery';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'sanad-phone-verification-delivery',
    '* * * * *',
    'select private.dispatch_phone_verification_delivery();'
  );
end;
$$;

commit;
