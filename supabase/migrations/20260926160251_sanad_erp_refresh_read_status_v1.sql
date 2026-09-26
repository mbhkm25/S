-- Current command status is independent of simple Bridge connectivity.
-- Completion must be proven by the cloud materializer's completed source snapshot.
create or replace function public.get_sanad_erp_refresh_status_v1(p_business_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_req public.sanad_erp_refresh_requests%rowtype;
 v_done public.business_erp_baseline_runs%rowtype;
 v_device public.business_bridge_devices%rowtype;
 v_uploading boolean := false;
begin
 if v_uid is null or not private.user_is_business_owner(p_business_id,v_uid) then
  raise exception 'business_owner_required' using errcode='42501';
 end if;
 select * into v_req from public.sanad_erp_refresh_requests
 where business_id=p_business_id order by created_at desc limit 1 for update;
 if v_req.id is not null and v_req.status in ('requested','claimed') then
  select * into v_done from public.business_erp_baseline_runs b
   where b.business_id=v_req.business_id
   and b.source_instance_id=v_req.source_instance_id
   and b.bridge_device_id=v_req.bridge_device_id
   and b.baseline_kind='logical_backup'
   and b.status='completed' and b.started_at>=v_req.created_at
   order by b.completed_at desc limit 1;
  if v_done.id is not null then
   update public.sanad_erp_refresh_requests set status='completed',
    completed_at=v_done.completed_at,snapshot_public_id=v_done.baseline_public_id,
    lease_expires_at=null
    where id=v_req.id;
   v_req.status:='completed';
   v_req.completed_at:=v_done.completed_at;
   v_req.snapshot_public_id:=v_done.baseline_public_id;
  elsif v_req.expires_at<=now() then
   update public.sanad_erp_refresh_requests set status='expired',
     last_error_code='refresh_timeout' where id=v_req.id;
   v_req.status:='expired';
   v_req.last_error_code:='refresh_timeout';
  else
   select exists(
    select 1 from public.business_erp_baseline_runs b
    where b.business_id=v_req.business_id
      and b.source_instance_id=v_req.source_instance_id
      and b.bridge_device_id=v_req.bridge_device_id
      and b.baseline_kind='logical_backup'
      and b.started_at>=v_req.created_at
      and b.status in ('pending','uploading')
   ) into v_uploading;
  end if;
 end if;
 select d.* into v_device from public.business_bridge_devices d
 join public.business_accounting_connections c on c.id=d.connection_id
 where d.business_id=p_business_id and d.status='active'
   and c.status='connected' and c.provider_code='edaa_v5'
 order by d.last_heartbeat_at desc nulls last limit 1;
 return jsonb_build_object(
  'status',case when v_req.id is null then 'idle'
   when v_uploading then 'uploading' else v_req.status end,
  'request_id',v_req.id,'requested_at',v_req.created_at,
  'claimed_at',v_req.claimed_at,'completed_at',v_req.completed_at,
  'snapshot_public_id',v_req.snapshot_public_id,
  'error_code',v_req.last_error_code,
  'device_online',coalesce(v_device.last_heartbeat_at>now()-interval '5 minutes',false),
  'device_last_heartbeat_at',v_device.last_heartbeat_at,'server_time',now()
 );
end;
$function$;
revoke all on function public.get_sanad_erp_refresh_status_v1(uuid) from public,anon;
grant execute on function public.get_sanad_erp_refresh_status_v1(uuid) to authenticated;
