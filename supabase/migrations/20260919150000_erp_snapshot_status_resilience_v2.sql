create or replace function public.get_business_erp_snapshot_status_v1(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_completed public.business_erp_baseline_runs%rowtype;
  v_latest public.business_erp_baseline_runs%rowtype;
  v_expected_tables integer := 0;
  v_expected_rows bigint := 0;
  v_received_tables integer := 0;
  v_received_rows bigint := 0;
  v_latest_chunk_received_at timestamptz;
  v_progress numeric := null;
  v_latest_run jsonb := null;
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

  select * into v_completed
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc nulls last, started_at desc
  limit 1;

  select * into v_latest
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
  order by started_at desc
  limit 1;

  if v_latest.id is not null then
    select count(*)::integer,
           coalesce(sum(value::bigint),0)
    into v_expected_tables,v_expected_rows
    from jsonb_each_text(coalesce(v_latest.expected_counts,'{}'::jsonb));

    if v_latest.status in ('started','uploading') then
      select
        count(distinct e.integrity->>'table_name') filter (
          where e.integrity->>'table_name' is not null
        )::integer,
        coalesce(sum(
          case
            when coalesce(e.integrity->>'row_count','') ~ '^[0-9]+$'
            then (e.integrity->>'row_count')::bigint
            else 0
          end
        ),0),
        max(e.received_at)
      into v_received_tables,v_received_rows,v_latest_chunk_received_at
      from public.business_erp_raw_events e
      where e.source_instance_id=v_latest.source_instance_id
        and e.entity_type='erp_logical_snapshot_chunk'
        and e.integrity->>'baseline_public_id'=v_latest.baseline_public_id::text
        and e.integrity->>'schema_fingerprint'=v_latest.schema_fingerprint;

      if v_expected_rows > 0 then
        v_progress := round((v_received_rows::numeric * 100.0) / v_expected_rows::numeric,1);
      end if;
    else
      select count(*)::integer,
             coalesce(sum(value::bigint),0)
      into v_received_tables,v_received_rows
      from jsonb_each_text(coalesce(v_latest.received_counts,'{}'::jsonb));

      if v_expected_rows > 0 then
        v_progress := round((v_received_rows::numeric * 100.0) / v_expected_rows::numeric,1);
      elsif v_latest.status='completed' then
        v_progress := 100;
      end if;
    end if;

    v_latest_run := jsonb_build_object(
      'snapshot_public_id',v_latest.baseline_public_id,
      'status',v_latest.status,
      'started_at',v_latest.started_at,
      'last_seen_at',v_latest.last_seen_at,
      'completed_at',v_latest.completed_at,
      'error_code',v_latest.error_code,
      'expected_table_count',v_expected_tables,
      'expected_row_count',v_expected_rows,
      'received_table_count',v_received_tables,
      'received_row_count',v_received_rows,
      'progress_percent',v_progress,
      'latest_chunk_received_at',v_latest_chunk_received_at
    );
  end if;

  if v_completed.id is null then
    return jsonb_build_object(
      'available',false,
      'snapshot_public_id',null,
      'status',coalesce(v_latest.status,'not_started'),
      'latest_run',v_latest_run,
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
    'latest_run',v_latest_run,
    'contract_version',2
  );
end;
$function$;

revoke all on function public.get_business_erp_snapshot_status_v1(uuid) from public,anon;
grant execute on function public.get_business_erp_snapshot_status_v1(uuid) to authenticated;
