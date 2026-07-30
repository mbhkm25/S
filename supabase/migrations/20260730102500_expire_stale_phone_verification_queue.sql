begin;

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
  where (
      status = 'sending'
      and claimed_at < now() - interval '5 minutes'
    )
    or (
      status in ('queued','failed')
      and expires_at <= now()
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.recover_stale_phone_verification_deliveries() from public, anon, authenticated;
grant execute on function public.recover_stale_phone_verification_deliveries() to service_role;

commit;
