create or replace function public.recover_stale_phone_verification_deliveries()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  update public.phone_verification_claims
  set status = case when expires_at <= now() then 'expired' else 'failed' end,
      last_error = case
        when expires_at <= now() then coalesce(last_error, 'verification_claim_expired')
        else coalesce(last_error, 'delivery_worker_timeout')
      end,
      response_token_hash = case when expires_at <= now() then null else response_token_hash end,
      claimed_at = case when status='sending' then null else claimed_at end,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'recovered_at', now(),
        'recovery_source', 'recover_stale_phone_verification_deliveries'
      )
  where (
      status = 'sending'
      and claimed_at < now() - interval '5 minutes'
    )
    or (
      status in ('queued','failed','sent')
      and expires_at <= now()
    );

  get diagnostics v_count = row_count;

  update public.profiles p
  set phone_verification_status='expired',
      phone_verification_updated_at=now(),
      updated_at=now()
  where p.phone is null
    and p.pending_phone is not null
    and p.phone_verification_status in ('pending','unverified')
    and exists (
      select 1 from public.phone_verification_claims c
      where c.user_id=p.id
        and c.phone_normalized=p.pending_phone
        and c.status='expired'
    )
    and not exists (
      select 1 from public.phone_verification_claims c
      where c.user_id=p.id
        and c.phone_normalized=p.pending_phone
        and c.status in ('queued','sending','sent','failed')
        and c.expires_at>now()
    );

  return v_count;
end;
$function$;

revoke all on function public.recover_stale_phone_verification_deliveries() from public,anon,authenticated;
grant execute on function public.recover_stale_phone_verification_deliveries() to service_role;

select public.recover_stale_phone_verification_deliveries();
