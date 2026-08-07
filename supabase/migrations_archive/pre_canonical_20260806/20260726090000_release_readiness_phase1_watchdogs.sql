-- SANAD Release Readiness Phase 1
-- Operational recovery for knowledge ingestion and phone verification delivery.

create or replace function public.recover_stale_phone_verification_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.phone_verification_claims
  set status = case when expires_at <= now() then 'expired' else 'failed' end,
      last_error = case
        when expires_at <= now() then coalesce(last_error, 'delivery_claim_expired')
        else coalesce(last_error, 'delivery_worker_timeout')
      end,
      claimed_at = null,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'recovered_at', now(),
        'recovery_source', 'recover_stale_phone_verification_deliveries'
      )
  where status = 'sending'
    and claimed_at < now() - interval '5 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.recover_stale_phone_verification_deliveries() from public, anon, authenticated;
grant execute on function public.recover_stale_phone_verification_deliveries() to service_role;

create or replace function public.recover_stale_knowledge_file_processing()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sanad_knowledge_files
  set processing_status = 'failed',
      processing_error = coalesce(processing_error, 'processing_timeout'),
      updated_at = now()
  where processing_status = 'processing'
    and updated_at < now() - interval '20 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.recover_stale_knowledge_file_processing() from public, anon, authenticated;
grant execute on function public.recover_stale_knowledge_file_processing() to service_role;

create or replace function public.get_phone_verification_delivery_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'queued', count(*) filter (where status = 'queued' and expires_at > now()),
    'sending', count(*) filter (where status = 'sending'),
    'failed_retryable', count(*) filter (where status = 'failed' and expires_at > now() and delivery_attempts < 3),
    'expired', count(*) filter (where status = 'expired' or expires_at <= now()),
    'oldest_actionable_at', min(requested_at) filter (
      where status in ('queued','failed')
        and expires_at > now()
        and delivery_attempts < 3
    )
  )
  from public.phone_verification_claims;
$$;

revoke all on function public.get_phone_verification_delivery_health() from public, anon, authenticated;
grant execute on function public.get_phone_verification_delivery_health() to service_role;

create or replace function public.requeue_my_phone_verification_if_needed()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim public.phone_verification_claims%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_claim
  from public.phone_verification_claims
  where user_id = v_user_id
  order by created_at desc
  limit 1
  for update;

  if v_claim.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_claim');
  end if;

  if v_claim.expires_at <= now() then
    update public.phone_verification_claims
    set status = 'expired', updated_at = now()
    where id = v_claim.id;
    return jsonb_build_object('ok', false, 'reason', 'expired', 'claim_id', v_claim.id);
  end if;

  if v_claim.status = 'sending'
     and v_claim.claimed_at < now() - interval '5 minutes' then
    update public.phone_verification_claims
    set status = 'failed',
        claimed_at = null,
        last_error = coalesce(last_error, 'delivery_worker_timeout'),
        updated_at = now()
    where id = v_claim.id;
    return jsonb_build_object(
      'ok', true,
      'status', 'failed',
      'claim_id', v_claim.id,
      'retryable', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_claim.status,
    'claim_id', v_claim.id,
    'retryable', v_claim.status in ('queued','failed')
  );
end;
$$;

revoke all on function public.requeue_my_phone_verification_if_needed() from public, anon;
grant execute on function public.requeue_my_phone_verification_if_needed() to authenticated;

update public.phone_verification_claims
set status = 'expired',
    last_error = coalesce(last_error, 'claim_expired_before_delivery'),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expired_by_migration', true)
where status in ('queued','failed')
  and expires_at <= now();

select cron.unschedule(jobid)
from cron.job
where jobname = 'sanad-phone-verification-recovery';

select cron.schedule(
  'sanad-phone-verification-recovery',
  '*/5 * * * *',
  $$select public.recover_stale_phone_verification_deliveries();$$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'sanad-knowledge-processing-recovery';

select cron.schedule(
  'sanad-knowledge-processing-recovery',
  '*/10 * * * *',
  $$select public.recover_stale_knowledge_file_processing();$$
);
