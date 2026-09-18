-- SANAD ERP replica read-surface hardening v1
-- Keep raw source rows available for controlled diagnostics, but do not expose them to ordinary business members.

create or replace function public.get_business_erp_snapshot_table_rows_v1(
  p_business_id uuid,
  p_table_name text,
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_snapshot uuid;
  v_limit integer := least(greatest(coalesce(p_limit,200),1),1000);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_items jsonb;
  v_total bigint;
  v_table text := btrim(coalesce(p_table_name,''));
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_table='' then raise exception 'table_name_required' using errcode='22023'; end if;

  -- Raw ERP rows are a diagnostic surface. Only the business owner may read them.
  if not private.user_is_business_owner(p_business_id,v_uid) then
    raise exception 'business_owner_required' using errcode='42501';
  end if;

  -- Defensive deny-list for authentication/security/operational tables.
  if lower(v_table) in (
    'tblusers',
    'tbluserssessions',
    'tblpermissions',
    'tblusergroup',
    'tblfundsusers',
    'tblstoresusers',
    'tblsalespointsusers',
    'tblsalespointsserversdb',
    'tblsmsaccountinfo'
  ) then
    raise exception 'erp_table_not_exposable' using errcode='42501';
  end if;

  select baseline_public_id into v_snapshot
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc
  limit 1;

  if v_snapshot is null then
    return jsonb_build_object('items','[]'::jsonb,'total',0,'snapshot_public_id',null,'contract_version',1);
  end if;

  select count(*) into v_total
  from public.business_erp_snapshot_rows
  where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name=v_table;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.row_key),'[]'::jsonb)
  into v_items
  from (
    select row_key,row_hash,row_data,captured_at
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name=v_table
    order by row_key
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'items',v_items,
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'snapshot_public_id',v_snapshot,
    'table_name',v_table,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_snapshot_table_rows_v1(uuid,text,integer,integer) from public,anon;
grant execute on function public.get_business_erp_snapshot_table_rows_v1(uuid,text,integer,integer) to authenticated;


create or replace function public.get_business_erp_replica_catalog_v1(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_run public.business_erp_baseline_runs%rowtype;
  v_tables jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  select * into v_run
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'available',false,
      'snapshot_public_id',null,
      'tables','[]'::jsonb,
      'contract_version',1
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name',x.table_name,
    'row_count',x.row_count
  ) order by x.table_name),'[]'::jsonb)
  into v_tables
  from (
    select
      e.key as table_name,
      case when e.value ~ '^[0-9]+$' then e.value::integer else 0 end as row_count
    from jsonb_each_text(coalesce(v_run.received_counts,'{}'::jsonb)) e
    where lower(e.key) not in (
      'tblusers',
      'tbluserssessions',
      'tblpermissions',
      'tblusergroup',
      'tblfundsusers',
      'tblstoresusers',
      'tblsalespointsusers',
      'tblsalespointsserversdb',
      'tblsmsaccountinfo'
    )
  ) x;

  return jsonb_build_object(
    'available',true,
    'snapshot_public_id',v_run.baseline_public_id,
    'completed_at',v_run.completed_at,
    'table_count',jsonb_array_length(v_tables),
    'tables',v_tables,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_replica_catalog_v1(uuid) from public,anon;
grant execute on function public.get_business_erp_replica_catalog_v1(uuid) to authenticated;
