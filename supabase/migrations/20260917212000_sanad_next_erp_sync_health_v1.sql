-- SANAD NEXT ERP sync health v1
-- Read-only owner/member observability for accounting connections, bridge devices,
-- source instances, baseline lifecycle and raw ERP normalization health.

create or replace function public.get_business_erp_sync_health_v1(
  p_business_id uuid,
  p_stale_after_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_stale_seconds integer := greatest(60, least(coalesce(p_stale_after_seconds, 300), 86400));
  v_connections jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not (
    private.user_is_business_owner(p_business_id, v_uid)
    or private.user_is_active_business_member(p_business_id, v_uid)
  ) then
    raise exception 'business_access_denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name, x.connection_id), '[]'::jsonb)
  into v_connections
  from (
    select
      c.id as connection_id,
      c.display_name,
      c.provider_code,
      c.connection_mode,
      c.status as connection_status,
      c.adapter_version,
      c.event_schema_version,
      c.last_sync_at,
      c.last_heartbeat_at as connection_last_heartbeat_at,
      c.last_error_code,
      c.last_error_at,
      s.id as source_instance_id,
      s.source_key,
      s.source_label,
      s.source_version,
      s.schema_fingerprint,
      s.status as source_status,
      s.last_seen_at as source_last_seen_at,
      d.id as bridge_device_id,
      d.device_public_id,
      d.device_label,
      d.status as device_status,
      d.bridge_version,
      d.adapter_version as device_adapter_version,
      d.last_heartbeat_at as device_last_heartbeat_at,
      d.authorized_at as device_authorized_at,
      case
        when c.status not in ('connected','pending') then 'connection_inactive'
        when coalesce(d.status, 'missing') <> 'active' then 'device_inactive'
        when d.last_heartbeat_at is null then 'never_seen'
        when d.last_heartbeat_at < now() - make_interval(secs => v_stale_seconds) then 'stale'
        when c.last_error_code is not null and c.last_error_at is not null
             and c.last_error_at >= coalesce(d.last_heartbeat_at, '-infinity'::timestamptz) then 'attention'
        when coalesce(ev.failed_count, 0) > 0 or coalesce(ev.warning_count, 0) > 0 then 'attention'
        else 'healthy'
      end as health_status,
      coalesce(ev.total_events, 0)::bigint as raw_event_count,
      coalesce(ev.pending_count, 0)::bigint as normalization_pending_count,
      coalesce(ev.warning_count, 0)::bigint as normalization_warning_count,
      coalesce(ev.failed_count, 0)::bigint as normalization_failed_count,
      ev.last_received_at,
      ev.last_normalized_at,
      coalesce(ev.revisioned_records, 0)::bigint as revisioned_record_count,
      b.baseline_public_id,
      b.status as baseline_status,
      b.started_at as baseline_started_at,
      b.last_seen_at as baseline_last_seen_at,
      b.completed_at as baseline_completed_at,
      b.error_code as baseline_error_code,
      b.expected_counts as baseline_expected_counts,
      b.received_counts as baseline_received_counts
    from public.business_accounting_connections c
    left join lateral (
      select src.*
      from public.business_erp_source_instances src
      where src.connection_id = c.id
      order by src.updated_at desc, src.created_at desc
      limit 1
    ) s on true
    left join lateral (
      select dev.*
      from public.business_bridge_devices dev
      where dev.connection_id = c.id
        and (s.id is null or dev.source_instance_id = s.id)
      order by (dev.status = 'active') desc, dev.last_heartbeat_at desc nulls last, dev.updated_at desc
      limit 1
    ) d on true
    left join lateral (
      select
        count(*) as total_events,
        count(*) filter (where r.normalization_status = 'pending') as pending_count,
        count(*) filter (where r.normalization_status = 'warning') as warning_count,
        count(*) filter (where r.normalization_status = 'failed') as failed_count,
        max(r.received_at) as last_received_at,
        max(r.normalized_at) as last_normalized_at,
        count(*) filter (
          where exists (
            select 1
            from public.business_erp_raw_events r2
            where r2.source_instance_id = r.source_instance_id
              and r2.entity_type = r.entity_type
              and r2.source_record_id = r.source_record_id
              and r2.revision <> r.revision
          )
        ) as revisioned_records
      from public.business_erp_raw_events r
      where r.connection_id = c.id
        and (s.id is null or r.source_instance_id = s.id)
    ) ev on true
    left join lateral (
      select br.*
      from public.business_erp_baseline_runs br
      where br.connection_id = c.id
        and (s.id is null or br.source_instance_id = s.id)
      order by br.created_at desc
      limit 1
    ) b on true
    where c.business_id = p_business_id
  ) x;

  return jsonb_build_object(
    'business_id', p_business_id,
    'server_time', now(),
    'stale_after_seconds', v_stale_seconds,
    'connections', v_connections,
    'contract_version', 1
  );
end;
$function$;

revoke all on function public.get_business_erp_sync_health_v1(uuid,integer) from public;
revoke all on function public.get_business_erp_sync_health_v1(uuid,integer) from anon;
grant execute on function public.get_business_erp_sync_health_v1(uuid,integer) to authenticated;
