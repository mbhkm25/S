alter table public.sanad_erp_refresh_requests
 add column if not exists attempts smallint not null default 0
 check (attempts between 0 and 3);

create unique index if not exists sanad_erp_refresh_requests_single_open_idx
 on public.sanad_erp_refresh_requests(business_id)
 where status in ('requested','claimed');

-- Callable only by existing device-credential-verifying Edge heartbeat via service_role.
-- Device-supplied raw IDs are never treated as authorization for browser users.
create or replace function public.bridge_claim_sanad_erp_refresh_v1(p_device_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $function$
declare v_req public.sanad_erp_refresh_requests%rowtype;
begin
 if not exists (
  select 1 from public.business_bridge_devices d
  where d.id=p_device_id and d.status='active'
 ) then
  return '{}'::jsonb;
 end if;
 update public.sanad_erp_refresh_requests
  set status='expired',last_error_code='request_timeout'
  where bridge_device_id=p_device_id and status in ('requested','claimed')
    and expires_at<=now();
 select * into v_req from public.sanad_erp_refresh_requests r
 where r.bridge_device_id=p_device_id
  and (r.status='requested'
   or (r.status='claimed' and r.lease_expires_at<now()))
  and r.expires_at>now() and r.attempts<3
 order by r.created_at asc limit 1 for update skip locked;
 if v_req.id is null then return '{}'::jsonb; end if;
 update public.sanad_erp_refresh_requests
  set status='claimed',claimed_at=now(),
    lease_expires_at=now()+interval '35 minutes',attempts=attempts+1
  where id=v_req.id;
 return jsonb_build_object('refresh_request_id',v_req.id,
  'command_kind','erp_logical_snapshot_refresh');
end;
$function$;
revoke all on function public.bridge_claim_sanad_erp_refresh_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.bridge_claim_sanad_erp_refresh_v1(uuid)
 to service_role;
