grant select, insert, update, delete on table public.business_locations to authenticated;
grant select, insert, update, delete on table public.business_accounting_connections to authenticated;
grant select, insert, update, delete on table public.business_erp_source_instances to authenticated;
grant select, insert, update, delete on table public.business_bridge_devices to authenticated;

grant select, insert, update, delete on table public.business_parties to authenticated;
grant select, insert, update, delete on table public.business_party_roles to authenticated;
grant select, insert, update, delete on table public.business_party_source_refs to authenticated;
grant select on table public.business_activity_events to authenticated;

grant insert on table public.business_bridge_pairing_tokens to authenticated;

-- Sensitive evidence/credential tables deliberately remain without authenticated grants.
revoke all on table public.business_bridge_device_credentials from authenticated;
revoke all on table public.business_erp_raw_events from authenticated;

-- Direct owner inserts are permitted only for short-lived, unused pairing tokens.
drop policy if exists business_bridge_pairing_tokens_owner_insert on public.business_bridge_pairing_tokens;
create policy business_bridge_pairing_tokens_owner_insert
on public.business_bridge_pairing_tokens for insert to authenticated
with check (
  private.user_is_business_owner(business_id, (select auth.uid()))
  and created_by_user_id = (select auth.uid())
  and status = 'pending'
  and consumed_at is null
  and device_id is null
  and expires_at > now() + interval '1 minute'
  and expires_at <= now() + interval '30 minutes'
  and token_hash ~ '^[0-9a-f]{64}$'
  and token_prefix ~ '^[0-9a-f]{8}$'
);