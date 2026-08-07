create or replace function public.create_report_delivery_artifacts(
  p_report_request_id uuid,
  p_link_ttl_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_request public.report_requests%rowtype;
  v_payload jsonb;
  v_snapshot public.report_snapshots%rowtype;
  v_raw_token text;
  v_token_hash text;
  v_token_id uuid;
  v_operation_ids uuid[];
  v_operations_count integer;
  v_verified_count integer;
  v_notes_count integer;
  v_expires_at timestamptz;
begin
  if coalesce(p_link_ttl_days, 0) < 1 or p_link_ttl_days > 90 then raise exception 'invalid_link_ttl_days'; end if;

  select * into v_request from public.report_requests where id=p_report_request_id for update;
  if not found then raise exception 'report_request_not_found'; end if;

  v_payload := public.get_report_payload_v2(p_report_request_id);
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then raise exception 'report_payload_unavailable'; end if;

  select coalesce(array_agg((item->>'id')::uuid), '{}'::uuid[])
    into v_operation_ids
  from jsonb_array_elements(coalesce(v_payload->'operations','[]'::jsonb)) item
  where nullif(item->>'id','') is not null;

  v_operations_count := coalesce((v_payload->>'operations_total_count')::integer,cardinality(v_operation_ids),0);

  select count(*) filter (where item->>'status'='verified'),
         count(*) filter (where coalesce((item->>'notes_count')::integer,0)>0)
    into v_verified_count,v_notes_count
  from jsonb_array_elements(coalesce(v_payload->'operations','[]'::jsonb)) item;

  insert into public.report_snapshots(
    report_request_id,requested_by_user_id,report_context,business_id,title,date_from,date_to,
    report_scope,filters,payload,operation_ids,operations_count,verified_count,
    operations_with_notes,payload_version,immutable_hash
  ) values (
    v_request.id,v_request.requested_by_user_id,v_request.report_context,v_request.business_id,
    v_request.report_title,v_request.date_from,v_request.date_to,v_request.report_scope,
    coalesce(v_request.filters,'{}'::jsonb),v_payload,v_operation_ids,v_operations_count,
    coalesce(v_verified_count,0),coalesce(v_notes_count,0),'operations-v2',
    encode(digest(v_payload::text,'sha256'),'hex')
  )
  on conflict (report_request_id) do update set
    payload=excluded.payload,operation_ids=excluded.operation_ids,
    operations_count=excluded.operations_count,verified_count=excluded.verified_count,
    operations_with_notes=excluded.operations_with_notes,immutable_hash=excluded.immutable_hash
  returning * into v_snapshot;

  if v_request.delivery_format in ('interactive','both') then
    update public.report_access_tokens set status='revoked',revoked_at=now()
      where report_snapshot_id=v_snapshot.id and status='active';
    v_raw_token := encode(extensions.gen_random_bytes(32),'hex');
    v_token_hash := encode(digest(v_raw_token,'sha256'),'hex');
    v_expires_at := now()+make_interval(days=>p_link_ttl_days);
    insert into public.report_access_tokens(report_snapshot_id,token_hash,expires_at)
      values(v_snapshot.id,v_token_hash,v_expires_at) returning id into v_token_id;
  end if;

  update public.report_requests
  set interactive_report_id=case when delivery_format in ('interactive','both') then v_snapshot.id else null end,
      interactive_status=case when delivery_format in ('interactive','both') then 'ready' else 'skipped' end,
      pdf_status=case when delivery_format in ('pdf','both') then 'pending' else 'skipped' end,
      result_metrics=coalesce(result_metrics,'{}'::jsonb)||jsonb_build_object(
        'snapshot_id',v_snapshot.id,'snapshot_hash',v_snapshot.immutable_hash,
        'delivery_format',delivery_format,'operations_count',v_operations_count,
        'verified_count',coalesce(v_verified_count,0),'operations_with_notes',coalesce(v_notes_count,0)
      ),updated_at=now()
  where id=v_request.id;

  return jsonb_build_object(
    'ok',true,'report_request_id',v_request.id,'delivery_format',v_request.delivery_format,
    'snapshot_id',v_snapshot.id,'access_token',v_raw_token,'access_token_id',v_token_id,
    'expires_at',v_expires_at,'pdf_required',v_request.delivery_format in ('pdf','both'),
    'interactive_required',v_request.delivery_format in ('interactive','both'),
    'operations_count',v_operations_count,'verified_count',coalesce(v_verified_count,0),
    'operations_with_notes',coalesce(v_notes_count,0)
  );
end;
$$;

revoke all on function public.create_report_delivery_artifacts(uuid,integer) from public;
grant execute on function public.create_report_delivery_artifacts(uuid,integer) to service_role;

comment on function public.create_report_delivery_artifacts(uuid,integer) is
'Creates one immutable report snapshot and, when requested, one expiring interactive access token. Raw token is returned once and never stored.';
