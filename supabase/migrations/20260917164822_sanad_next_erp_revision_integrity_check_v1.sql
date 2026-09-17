create or replace function public.check_erp_revision_integrity_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_duplicate_current_groups bigint;
  v_current_with_superseded_at bigint;
  v_noncurrent_without_superseded_at bigint;
  v_dangling_superseded_links bigint;
begin
  select count(*) into v_duplicate_current_groups
  from (
    select a.business_id, a.source_instance_id, a.source_entity_type, a.source_record_id
    from public.business_activity_events a
    where a.source_kind = 'erp'
      and a.is_current = true
      and a.source_instance_id is not null
      and a.source_entity_type is not null
      and a.source_record_id is not null
    group by a.business_id, a.source_instance_id, a.source_entity_type, a.source_record_id
    having count(*) > 1
  ) duplicates;

  select count(*) into v_current_with_superseded_at
  from public.business_activity_events a
  where a.source_kind = 'erp'
    and a.is_current = true
    and a.superseded_at is not null;

  select count(*) into v_noncurrent_without_superseded_at
  from public.business_activity_events a
  where a.source_kind = 'erp'
    and a.is_current = false
    and a.superseded_at is null;

  select count(*) into v_dangling_superseded_links
  from public.business_activity_events a
  left join public.business_erp_raw_events r on r.id = a.superseded_by_raw_event_id
  where a.source_kind = 'erp'
    and a.superseded_by_raw_event_id is not null
    and r.id is null;

  return jsonb_build_object(
    'ok',
      v_duplicate_current_groups = 0
      and v_current_with_superseded_at = 0
      and v_noncurrent_without_superseded_at = 0
      and v_dangling_superseded_links = 0,
    'duplicate_current_groups', v_duplicate_current_groups,
    'current_with_superseded_at', v_current_with_superseded_at,
    'noncurrent_without_superseded_at', v_noncurrent_without_superseded_at,
    'dangling_superseded_links', v_dangling_superseded_links,
    'checked_at', now()
  );
end;
$function$;

revoke all on function public.check_erp_revision_integrity_v1() from public;
revoke all on function public.check_erp_revision_integrity_v1() from anon;
revoke all on function public.check_erp_revision_integrity_v1() from authenticated;
grant execute on function public.check_erp_revision_integrity_v1() to service_role;
