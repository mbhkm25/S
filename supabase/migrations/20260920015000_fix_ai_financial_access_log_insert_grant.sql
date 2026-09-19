-- Fix live ERP AI reads for authenticated business users.
-- 1) Allow the existing RLS-protected access log to accept inserts.
-- 2) Report the latest completed ERP snapshot as readable truth even when a newer sync is still uploading.

grant insert on table public.ai_financial_context_access_log to authenticated;

create or replace function public.get_business_erp_snapshot_status_v1(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_latest public.business_erp_baseline_runs%rowtype;
  v_completed public.business_erp_baseline_runs%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  select * into v_latest
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
  order by started_at desc
  limit 1;

  select * into v_completed
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc nulls last, started_at desc
  limit 1;

  if v_completed.id is null then
    if v_latest.id is null then
      return jsonb_build_object(
        'available',false,
        'snapshot_public_id',null,
        'status','not_started',
        'current_sync',null,
        'contract_version',2
      );
    end if;

    return jsonb_build_object(
      'available',false,
      'snapshot_public_id',null,
      'status','no_completed_snapshot',
      'current_sync',jsonb_build_object(
        'snapshot_public_id',v_latest.baseline_public_id,
        'status',v_latest.status,
        'started_at',v_latest.started_at,
        'completed_at',v_latest.completed_at
      ),
      'contract_version',2
    );
  end if;

  return jsonb_build_object(
    'available',true,
    'snapshot_public_id',v_completed.baseline_public_id,
    'status','completed',
    'started_at',v_completed.started_at,
    'completed_at',v_completed.completed_at,
    'expected_counts',v_completed.expected_counts,
    'received_counts',v_completed.received_counts,
    'manifest',v_completed.manifest,
    'current_sync',case
      when v_latest.id is not null and v_latest.id <> v_completed.id then
        jsonb_build_object(
          'snapshot_public_id',v_latest.baseline_public_id,
          'status',v_latest.status,
          'started_at',v_latest.started_at,
          'completed_at',v_latest.completed_at
        )
      else null
    end,
    'contract_version',2
  );
end;
$function$;
