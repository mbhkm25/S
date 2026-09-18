-- SANAD ERP sales/purchases semantic read models v1
-- Read-only views over the latest completed logical snapshot.

create or replace function public.get_business_erp_documents_v1(
  p_business_id uuid,
  p_document_kind text,
  p_query text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 50,
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
  v_kind text := lower(btrim(coalesce(p_document_kind,'')));
  v_table text;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
  v_items jsonb;
  v_total bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_kind not in ('sale','purchase') then raise exception 'invalid_document_kind' using errcode='22023'; end if;
  if p_from_date is not null and p_to_date is not null and p_from_date>p_to_date then
    raise exception 'invalid_date_range' using errcode='22023';
  end if;
  if not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then raise exception 'business_access_denied' using errcode='42501'; end if;

  v_table := case when v_kind='sale' then 'tblSellInvoice' else 'tblBuyInvoice' end;

  select baseline_public_id into v_snapshot
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc
  limit 1;

  if v_snapshot is null then
    return jsonb_build_object(
      'status','snapshot_unavailable',
      'document_kind',v_kind,
      'items','[]'::jsonb,
      'total',0,
      'snapshot_public_id',null,
      'contract_version',1
    );
  end if;

  with docs as (
    select
      case when coalesce(r.row_data->>'ID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'ID')::bigint end as document_id,
      r.row_data->>'TheNumber' as document_number,
      case when coalesce(r.row_data->>'TheDate','') <> ''
           then (r.row_data->>'TheDate')::timestamp end as document_date,
      r.row_data->>'ThePay' as payment_method,
      case when coalesce(r.row_data->>'AccountID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'AccountID')::bigint end as account_id,
      case when coalesce(r.row_data->>'CurrencyID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'CurrencyID')::bigint end as currency_id,
      case when coalesce(r.row_data->>'ExchangePrice','') ~ '^-?[0-9]+(\.[0-9]+)?$'
           then (r.row_data->>'ExchangePrice')::numeric end as exchange_price,
      case when v_kind='sale' then r.row_data->>'CustomerName'
           else r.row_data->>'SupplierName' end as party_name,
      case when coalesce(r.row_data->>'EntryID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'EntryID')::bigint end as entry_id,
      r.row_data->>'Notes' as notes,
      case when lower(coalesce(r.row_data->>'Deleted','false')) in ('true','1') then true else false end as deleted,
      case when lower(coalesce(r.row_data->>'IsLocked','false')) in ('true','1') then true else false end as locked,
      r.captured_at
    from public.business_erp_snapshot_rows r
    where r.business_id=p_business_id
      and r.snapshot_public_id=v_snapshot
      and r.table_name=v_table
  ),
  currency as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as id,
      row_data->>'CurrencyName' as currency_name,
      row_data->>'ArabicCode' as arabic_code,
      row_data->>'EnglishCode' as english_code
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblCurrencies'
  ),
  detail_totals as (
    select
      case when coalesce(row_data->>'ParentID','') ~ '^-?[0-9]+$'
           then (row_data->>'ParentID')::bigint end as parent_id,
      count(*)::integer as line_count,
      coalesce(sum(
        case when coalesce(row_data->>'TotalAmount','') ~ '^-?[0-9]+(\.[0-9]+)?$'
             then (row_data->>'TotalAmount')::numeric else 0 end
      ),0) as source_line_total
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name=case when v_kind='sale' then 'tblSellInvoiceDetailes' else 'tblBuyInvoiceDetailes' end
    group by case when coalesce(row_data->>'ParentID','') ~ '^-?[0-9]+$'
                  then (row_data->>'ParentID')::bigint end
  ),
  filtered as (
    select
      d.*,
      c.currency_name,
      c.arabic_code,
      c.english_code,
      coalesce(dt.line_count,0) as line_count,
      coalesce(dt.source_line_total,0) as source_line_total
    from docs d
    left join currency c on c.id=d.currency_id
    left join detail_totals dt on dt.parent_id=d.document_id
    where (p_from_date is null or d.document_date::date>=p_from_date)
      and (p_to_date is null or d.document_date::date<=p_to_date)
      and (
        v_query is null
        or lower(coalesce(d.party_name,'')) like '%'||lower(v_query)||'%'
        or lower(coalesce(d.document_number,'')) like '%'||lower(v_query)||'%'
        or lower(coalesce(d.notes,'')) like '%'||lower(v_query)||'%'
      )
  )
  select count(*) into v_total from filtered;

  with docs as (
    select
      case when coalesce(r.row_data->>'ID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'ID')::bigint end as document_id,
      r.row_data->>'TheNumber' as document_number,
      case when coalesce(r.row_data->>'TheDate','') <> ''
           then (r.row_data->>'TheDate')::timestamp end as document_date,
      r.row_data->>'ThePay' as payment_method,
      case when coalesce(r.row_data->>'AccountID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'AccountID')::bigint end as account_id,
      case when coalesce(r.row_data->>'CurrencyID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'CurrencyID')::bigint end as currency_id,
      case when coalesce(r.row_data->>'ExchangePrice','') ~ '^-?[0-9]+(\.[0-9]+)?$'
           then (r.row_data->>'ExchangePrice')::numeric end as exchange_price,
      case when v_kind='sale' then r.row_data->>'CustomerName'
           else r.row_data->>'SupplierName' end as party_name,
      case when coalesce(r.row_data->>'EntryID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'EntryID')::bigint end as entry_id,
      r.row_data->>'Notes' as notes,
      case when lower(coalesce(r.row_data->>'Deleted','false')) in ('true','1') then true else false end as deleted,
      case when lower(coalesce(r.row_data->>'IsLocked','false')) in ('true','1') then true else false end as locked,
      r.captured_at
    from public.business_erp_snapshot_rows r
    where r.business_id=p_business_id
      and r.snapshot_public_id=v_snapshot
      and r.table_name=v_table
  ),
  currency as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as id,
      row_data->>'CurrencyName' as currency_name,
      row_data->>'ArabicCode' as arabic_code,
      row_data->>'EnglishCode' as english_code
    from public.business_erp_snapshot_rows
    where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name='tblCurrencies'
  ),
  detail_totals as (
    select
      case when coalesce(row_data->>'ParentID','') ~ '^-?[0-9]+$'
           then (row_data->>'ParentID')::bigint end as parent_id,
      count(*)::integer as line_count,
      coalesce(sum(
        case when coalesce(row_data->>'TotalAmount','') ~ '^-?[0-9]+(\.[0-9]+)?$'
             then (row_data->>'TotalAmount')::numeric else 0 end
      ),0) as source_line_total
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name=case when v_kind='sale' then 'tblSellInvoiceDetailes' else 'tblBuyInvoiceDetailes' end
    group by case when coalesce(row_data->>'ParentID','') ~ '^-?[0-9]+$'
                  then (row_data->>'ParentID')::bigint end
  ),
  filtered as (
    select d.*,c.currency_name,c.arabic_code,c.english_code,
           coalesce(dt.line_count,0) line_count,
           coalesce(dt.source_line_total,0) source_line_total
    from docs d
    left join currency c on c.id=d.currency_id
    left join detail_totals dt on dt.parent_id=d.document_id
    where (p_from_date is null or d.document_date::date>=p_from_date)
      and (p_to_date is null or d.document_date::date<=p_to_date)
      and (
        v_query is null
        or lower(coalesce(d.party_name,'')) like '%'||lower(v_query)||'%'
        or lower(coalesce(d.document_number,'')) like '%'||lower(v_query)||'%'
        or lower(coalesce(d.notes,'')) like '%'||lower(v_query)||'%'
      )
    order by d.document_date desc nulls last,d.document_id desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(filtered)),'[]'::jsonb) into v_items from filtered;

  return jsonb_build_object(
    'status','ok',
    'document_kind',v_kind,
    'snapshot_public_id',v_snapshot,
    'items',v_items,
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'amount_semantics',jsonb_build_object(
      'source_line_total','sum of detail TotalAmount fields; presented as source line total, not inferred invoice grand total'
    ),
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_documents_v1(uuid,text,text,date,date,integer,integer) from public,anon;
grant execute on function public.get_business_erp_documents_v1(uuid,text,text,date,date,integer,integer) to authenticated;


create or replace function public.get_business_erp_document_detail_v1(
  p_business_id uuid,
  p_document_kind text,
  p_document_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_snapshot uuid;
  v_kind text := lower(btrim(coalesce(p_document_kind,'')));
  v_header_table text;
  v_detail_table text;
  v_header jsonb;
  v_lines jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_document_id is null then raise exception 'document_id_required' using errcode='22023'; end if;
  if v_kind not in ('sale','purchase') then raise exception 'invalid_document_kind' using errcode='22023'; end if;
  if not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then raise exception 'business_access_denied' using errcode='42501'; end if;

  v_header_table := case when v_kind='sale' then 'tblSellInvoice' else 'tblBuyInvoice' end;
  v_detail_table := case when v_kind='sale' then 'tblSellInvoiceDetailes' else 'tblBuyInvoiceDetailes' end;

  select baseline_public_id into v_snapshot
  from public.business_erp_baseline_runs
  where business_id=p_business_id and baseline_kind='logical_backup' and status='completed'
  order by completed_at desc limit 1;

  if v_snapshot is null then
    return jsonb_build_object('status','snapshot_unavailable','contract_version',1);
  end if;

  with h as (
    select row_data,captured_at
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name=v_header_table
      and coalesce(row_data->>'ID','') ~ '^-?[0-9]+$'
      and (row_data->>'ID')::bigint=p_document_id
    limit 1
  ),
  c as (
    select row_data
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblCurrencies'
      and coalesce(row_data->>'ID','') ~ '^-?[0-9]+$'
      and (row_data->>'ID')::bigint=(
        select case when coalesce(row_data->>'CurrencyID','') ~ '^-?[0-9]+$'
                    then (row_data->>'CurrencyID')::bigint end from h
      )
    limit 1
  )
  select jsonb_build_object(
    'document_id',p_document_id,
    'document_kind',v_kind,
    'document_number',h.row_data->>'TheNumber',
    'document_date',h.row_data->>'TheDate',
    'payment_method',h.row_data->>'ThePay',
    'party_name',case when v_kind='sale' then h.row_data->>'CustomerName' else h.row_data->>'SupplierName' end,
    'account_id',h.row_data->>'AccountID',
    'currency_id',h.row_data->>'CurrencyID',
    'currency_name',c.row_data->>'CurrencyName',
    'arabic_code',c.row_data->>'ArabicCode',
    'english_code',c.row_data->>'EnglishCode',
    'exchange_price',h.row_data->>'ExchangePrice',
    'discount',h.row_data->>'Descount',
    'services_amount',case when v_kind='sale' then h.row_data->>'SalesServices' else null end,
    'entry_id',h.row_data->>'EntryID',
    'notes',h.row_data->>'Notes',
    'deleted',h.row_data->>'Deleted',
    'locked',h.row_data->>'IsLocked',
    'captured_at',h.captured_at
  ) into v_header
  from h left join c on true;

  if v_header is null then raise exception 'erp_document_not_found' using errcode='22023'; end if;

  with classes as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end id,
      row_data->>'ClassName' class_name,
      row_data->>'ClassNumber' class_number
    from public.business_erp_snapshot_rows
    where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name='tblClasses'
  ),
  units as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end id,
      row_data->>'UnitName' unit_name
    from public.business_erp_snapshot_rows
    where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name='tblUnits'
  ),
  lines as (
    select
      case when coalesce(r.row_data->>'ID','') ~ '^-?[0-9]+$' then (r.row_data->>'ID')::bigint end line_id,
      case when coalesce(r.row_data->>'ClassID','') ~ '^-?[0-9]+$' then (r.row_data->>'ClassID')::bigint end class_id,
      c.class_name,c.class_number,
      case when coalesce(r.row_data->>'UnitID','') ~ '^-?[0-9]+$' then (r.row_data->>'UnitID')::bigint end unit_id,
      u.unit_name,
      r.row_data->>'Quantity' quantity,
      r.row_data->>'UnitPrice' unit_price,
      r.row_data->>'SubDescount' line_discount,
      r.row_data->>'TotalAmount' source_total_amount,
      r.row_data->>'SerialNumber' serial_number,
      r.row_data->>'ClassNotes' class_notes
    from public.business_erp_snapshot_rows r
    left join classes c on c.id=case when coalesce(r.row_data->>'ClassID','') ~ '^-?[0-9]+$' then (r.row_data->>'ClassID')::bigint end
    left join units u on u.id=case when coalesce(r.row_data->>'UnitID','') ~ '^-?[0-9]+$' then (r.row_data->>'UnitID')::bigint end
    where r.business_id=p_business_id
      and r.snapshot_public_id=v_snapshot
      and r.table_name=v_detail_table
      and coalesce(r.row_data->>'ParentID','') ~ '^-?[0-9]+$'
      and (r.row_data->>'ParentID')::bigint=p_document_id
    order by line_id
  )
  select coalesce(jsonb_agg(to_jsonb(lines)),'[]'::jsonb) into v_lines from lines;

  return jsonb_build_object(
    'status','ok',
    'snapshot_public_id',v_snapshot,
    'header',v_header,
    'lines',v_lines,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_document_detail_v1(uuid,text,bigint) from public,anon;
grant execute on function public.get_business_erp_document_detail_v1(uuid,text,bigint) to authenticated;
