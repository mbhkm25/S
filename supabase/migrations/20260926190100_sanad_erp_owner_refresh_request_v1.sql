-- Authenticated owners may request exactly one fixed read-only Bridge action.
create or replace function public.request_sanad_erp_refresh_v1(p_business_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_device public.business_bridge_devices%rowtype;
 v_previous public.sanad_erp_refresh_requests%rowtype;
begin
 if v_uid is null or not private.user_is_business_owner(p_business_id,v_uid) then
   raise exception 'business_owner_required' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_business_id::text));
 select d.* into v_device
 from public.business_bridge_devices d
 join public.business_accounting_connections c on c.id=d.connection_id
 join public.business_erp_source_instances s on s.id=d.source_instance_id
 where d.business_id=p_business_id and c.business_id=p_business_id
   and s.business_id=p_business_id and d.status='active'
   and c.status='connected' and c.provider_code='edaa_v5'
   and s.status='active'
   and d.last_heartbeat_at>now()-interval '5 minutes'
 order by d.last_heartbeat_at desc limit 1;
 if v_device.id is null then
   return jsonb_build_object('status','offline','error_code','active_bridge_required');
 end if;
 update public.sanad_erp_refresh_requests set status='expired',
  last_error_code='request_timeout'
 where business_id=p_business_id and status in ('requested','claimed')
  and expires_at<=now();
 select * into v_previous from public.sanad_erp_refresh_requests
 where business_id=p_business_id and status in ('requested','claimed')
 order by created_at desc limit 1;
 if v_previous.id is not null then
  return jsonb_build_object('status',v_previous.status,'request_id',v_previous.id,
   'deduplicated',true);
 end if;
 select * into v_previous from public.sanad_erp_refresh_requests
 where business_id=p_business_id and status='completed'
   and completed_at>now()-interval '60 seconds'
 order by completed_at desc limit 1;
 if v_previous.id is not null then
  return jsonb_build_object('status','cooldown','request_id',v_previous.id,
   'snapshot_public_id',v_previous.snapshot_public_id);
 end if;
 insert into public.sanad_erp_refresh_requests
   (business_id,connection_id,source_instance_id,bridge_device_id,requested_by)
 values(p_business_id,v_device.connection_id,v_device.source_instance_id,v_device.id,v_uid)
 returning * into v_previous;
 return jsonb_build_object('status','requested','request_id',v_previous.id,
  'requested_at',v_previous.created_at);
end;
$function$;
revoke all on function public.request_sanad_erp_refresh_v1(uuid) from public,anon;
grant execute on function public.request_sanad_erp_refresh_v1(uuid) to authenticated;
