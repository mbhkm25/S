-- SANAD ERP semantic customer statement v1
-- Derives a governed, read-only customer/account statement from the latest completed logical Edaa snapshot.

create or replace function public.get_business_erp_customer_candidates_v1(
  p_business_id uuid,
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_snapshot uuid;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
  v_items jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  select baseline_public_id into v_snapshot
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc
  limit 1;

  if v_snapshot is null then
    return jsonb_build_object(
      'items','[]'::jsonb,
      'snapshot_public_id',null,
      'status','snapshot_unavailable',
      'contract_version',1
    );
  end if;

  with sales as (
    select
      nullif(btrim(r.row_data->>'CustomerName'),'') as customer_name,
      case when coalesce(r.row_data->>'AccountID','') ~ '^-?[0-9]+$'
           then (r.row_data->>'AccountID')::bigint end as account_id
    from public.business_erp_snapshot_rows r
    where r.business_id=p_business_id
      and r.snapshot_public_id=v_snapshot
      and r.table_name='tblSellInvoice'
      and lower(coalesce(r.row_data->>'Deleted','false')) not in ('true','1')
  ),
  grouped as (
    select
      customer_name,
      account_id,
      count(*)::bigint as sale_count
    from sales
    where customer_name is not null and account_id is not null
    group by customer_name,account_id
  ),
  name_accounts as (
    select customer_name,count(*)::integer as account_count
    from grouped
    group by customer_name
  ),
  accounts as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as id,
      row_data->>'AccountName' as account_name,
      row_data->>'AccountNumber' as account_number,
      row_data->>'AccountType' as account_type
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblAccounts'
  ),
  customers as (
    select
      row_data->>'CustomerName' as customer_name,
      row_data->>'CustomerNumber' as customer_number,
      row_data->>'Mobil' as mobile,
      row_data->>'WorkPhone' as work_phone,
      row_data->>'Address' as address
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblCustomersInfo'
  ),
  result as (
    select
      g.customer_name,
      g.account_id,
      g.sale_count,
      na.account_count,
      a.account_name,
      a.account_number,
      a.account_type,
      c.customer_number,
      c.mobile,
      c.work_phone,
      c.address,
      case when na.account_count=1 then 'resolved_unique_sale_account' else 'ambiguous_multiple_sale_accounts' end as resolution_status
    from grouped g
    join name_accounts na on na.customer_name=g.customer_name
    left join accounts a on a.id=g.account_id
    left join customers c on btrim(coalesce(c.customer_name,''))=btrim(coalesce(g.customer_name,''))
    where v_query is null
       or lower(g.customer_name) like '%'||lower(v_query)||'%'
       or lower(coalesce(a.account_name,'')) like '%'||lower(v_query)||'%'
       or lower(coalesce(a.account_number,'')) like '%'||lower(v_query)||'%'
       or lower(coalesce(c.customer_number,'')) like '%'||lower(v_query)||'%'
       or lower(coalesce(c.mobile,'')) like '%'||lower(v_query)||'%'
    order by
      case when v_query is not null and lower(g.customer_name)=lower(v_query) then 0 else 1 end,
      g.customer_name,
      g.account_id
    limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) into v_items from result;

  return jsonb_build_object(
    'items',v_items,
    'snapshot_public_id',v_snapshot,
    'status','ok',
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_customer_candidates_v1(uuid,text,integer) from public,anon;
grant execute on function public.get_business_erp_customer_candidates_v1(uuid,text,integer) to authenticated;


create or replace function public.get_business_erp_customer_statement_v1(
  p_business_id uuid,
  p_account_id bigint,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_snapshot uuid;
  v_account jsonb;
  v_identity jsonb;
  v_items jsonb;
  v_totals jsonb;
  v_opening jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_account_id is null then raise exception 'account_id_required' using errcode='22023'; end if;
  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range' using errcode='22023';
  end if;
  if not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  select baseline_public_id into v_snapshot
  from public.business_erp_baseline_runs
  where business_id=p_business_id
    and baseline_kind='logical_backup'
    and status='completed'
  order by completed_at desc
  limit 1;

  if v_snapshot is null then
    return jsonb_build_object('status','snapshot_unavailable','items','[]'::jsonb,'contract_version',1);
  end if;

  select jsonb_build_object(
    'account_id',p_account_id,
    'account_name',r.row_data->>'AccountName',
    'account_number',r.row_data->>'AccountNumber',
    'account_type',r.row_data->>'AccountType'
  ) into v_account
  from public.business_erp_snapshot_rows r
  where r.business_id=p_business_id
    and r.snapshot_public_id=v_snapshot
    and r.table_name='tblAccounts'
    and coalesce(r.row_data->>'ID','') ~ '^-?[0-9]+$'
    and (r.row_data->>'ID')::bigint=p_account_id
  limit 1;

  if v_account is null then
    raise exception 'erp_account_not_found' using errcode='22023';
  end if;

  with sales_names as (
    select
      nullif(btrim(row_data->>'CustomerName'),'') as customer_name,
      count(*)::bigint as sale_count
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblSellInvoice'
      and coalesce(row_data->>'AccountID','') ~ '^-?[0-9]+$'
      and (row_data->>'AccountID')::bigint=p_account_id
      and lower(coalesce(row_data->>'Deleted','false')) not in ('true','1')
    group by nullif(btrim(row_data->>'CustomerName'),'')
  ),
  ranked as (
    select customer_name,sale_count,
           row_number() over(order by sale_count desc,customer_name) as rn,
           count(*) over() as distinct_name_count
    from sales_names
    where customer_name is not null
  ),
  top_name as (
    select * from ranked where rn=1
  ),
  master as (
    select row_data
    from public.business_erp_snapshot_rows r, top_name t
    where r.business_id=p_business_id
      and r.snapshot_public_id=v_snapshot
      and r.table_name='tblCustomersInfo'
      and btrim(coalesce(r.row_data->>'CustomerName',''))=btrim(coalesce(t.customer_name,''))
    limit 1
  )
  select jsonb_build_object(
    'customer_name',t.customer_name,
    'sale_count',t.sale_count,
    'distinct_names_on_account',t.distinct_name_count,
    'identity_status',case
      when t.customer_name is null then 'unresolved_no_sale_name'
      when t.distinct_name_count=1 then 'resolved_unique_account_name'
      else 'warning_multiple_names_on_account'
    end,
    'customer_number',m.row_data->>'CustomerNumber',
    'mobile',m.row_data->>'Mobil',
    'work_phone',m.row_data->>'WorkPhone',
    'address',m.row_data->>'Address'
  )
  into v_identity
  from top_name t
  left join master m on true;

  with currencies as (
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
  entries as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as id,
      case when coalesce(row_data->>'EntryNumber','') ~ '^-?[0-9]+$' then (row_data->>'EntryNumber')::bigint end as entry_number,
      row_data->>'DocType' as doc_type,
      case when coalesce(row_data->>'DocID','') ~ '^-?[0-9]+$' then (row_data->>'DocID')::bigint end as doc_id,
      row_data->>'DocNumber' as doc_number,
      case when coalesce(row_data->>'TheDate','') <> '' then (row_data->>'TheDate')::timestamp end as entry_date,
      row_data->>'Notes' as entry_notes
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblEntries'
  ),
  details as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as detail_id,
      case when coalesce(row_data->>'ParentID','') ~ '^-?[0-9]+$' then (row_data->>'ParentID')::bigint end as parent_id,
      case when coalesce(row_data->>'AccountID','') ~ '^-?[0-9]+$' then (row_data->>'AccountID')::bigint end as account_id,
      case when coalesce(row_data->>'CurrencyID','') ~ '^-?[0-9]+$' then (row_data->>'CurrencyID')::bigint end as currency_id,
      case when coalesce(row_data->>'Amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (row_data->>'Amount')::numeric end as signed_amount,
      case when coalesce(row_data->>'MCAmount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (row_data->>'MCAmount')::numeric end as mc_amount,
      row_data->>'Notes' as detail_notes
    from public.business_erp_snapshot_rows
    where business_id=p_business_id
      and snapshot_public_id=v_snapshot
      and table_name='tblEntriesDetails'
  ),
  ledger_all as (
    select
      d.detail_id,
      e.id as entry_id,
      e.entry_number,
      e.doc_type,
      e.doc_id,
      e.doc_number,
      e.entry_date,
      coalesce(nullif(d.detail_notes,''),e.entry_notes) as description,
      d.currency_id,
      c.currency_name,
      c.arabic_code,
      c.english_code,
      d.signed_amount,
      d.mc_amount,
      case when d.signed_amount < 0 then -d.signed_amount else 0 end as debit,
      case when d.signed_amount > 0 then d.signed_amount else 0 end as credit
    from details d
    join entries e on e.id=d.parent_id
    left join currencies c on c.id=d.currency_id
    where d.account_id=p_account_id
  ),
  opening as (
    select
      currency_id,
      max(currency_name) as currency_name,
      max(arabic_code) as arabic_code,
      max(english_code) as english_code,
      coalesce(sum(debit),0) as debit,
      coalesce(sum(credit),0) as credit,
      coalesce(sum(debit-credit),0) as balance
    from ledger_all
    where p_from_date is not null and entry_date::date < p_from_date
    group by currency_id
  ),
  ranged as (
    select *
    from ledger_all
    where (p_from_date is null or entry_date::date >= p_from_date)
      and (p_to_date is null or entry_date::date <= p_to_date)
  ),
  with_running as (
    select
      r.*,
      coalesce(o.balance,0)
        + sum(r.debit-r.credit) over(
            partition by r.currency_id
            order by r.entry_date,r.entry_id,r.detail_id
            rows between unbounded preceding and current row
          ) as running_balance
    from ranged r
    left join opening o on o.currency_id=r.currency_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'detail_id',detail_id,
    'entry_id',entry_id,
    'entry_number',entry_number,
    'doc_type',doc_type,
    'doc_id',doc_id,
    'doc_number',doc_number,
    'date',entry_date,
    'description',description,
    'currency_id',currency_id,
    'currency_name',currency_name,
    'arabic_code',arabic_code,
    'english_code',english_code,
    'debit',debit,
    'credit',credit,
    'signed_source_amount',signed_amount,
    'mc_amount',mc_amount,
    'running_balance',running_balance
  ) order by entry_date,entry_id,detail_id),'[]'::jsonb)
  into v_items
  from with_running;

  with currencies as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as id,
      row_data->>'CurrencyName' as currency_name,
      row_data->>'ArabicCode' as arabic_code,
      row_data->>'EnglishCode' as english_code
    from public.business_erp_snapshot_rows
    where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name='tblCurrencies'
  ),
  entries as (
    select
      case when coalesce(row_data->>'ID','') ~ '^-?[0-9]+$' then (row_data->>'ID')::bigint end as id,
      case when coalesce(row_data->>'TheDate','') <> '' then (row_data->>'TheDate')::timestamp end as entry_date
    from public.business_erp_snapshot_rows
    where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name='tblEntries'
  ),
  details as (
    select
      case when coalesce(row_data->>'ParentID','') ~ '^-?[0-9]+$' then (row_data->>'ParentID')::bigint end as parent_id,
      case when coalesce(row_data->>'AccountID','') ~ '^-?[0-9]+$' then (row_data->>'AccountID')::bigint end as account_id,
      case when coalesce(row_data->>'CurrencyID','') ~ '^-?[0-9]+$' then (row_data->>'CurrencyID')::bigint end as currency_id,
      case when coalesce(row_data->>'Amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (row_data->>'Amount')::numeric end as signed_amount
    from public.business_erp_snapshot_rows
    where business_id=p_business_id and snapshot_public_id=v_snapshot and table_name='tblEntriesDetails'
  ),
  ledger as (
    select e.entry_date,d.currency_id,c.currency_name,c.arabic_code,c.english_code,
           case when d.signed_amount<0 then -d.signed_amount else 0 end as debit,
           case when d.signed_amount>0 then d.signed_amount else 0 end as credit
    from details d join entries e on e.id=d.parent_id
    left join currencies c on c.id=d.currency_id
    where d.account_id=p_account_id
  ),
  opening as (
    select currency_id,max(currency_name) currency_name,max(arabic_code) arabic_code,max(english_code) english_code,
           coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit,coalesce(sum(debit-credit),0) balance
    from ledger
    where p_from_date is not null and entry_date::date<p_from_date
    group by currency_id
  ),
  ranged as (
    select * from ledger
    where (p_from_date is null or entry_date::date>=p_from_date)
      and (p_to_date is null or entry_date::date<=p_to_date)
  ),
  totals as (
    select currency_id,max(currency_name) currency_name,max(arabic_code) arabic_code,max(english_code) english_code,
           coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit,coalesce(sum(debit-credit),0) movement_balance
    from ranged group by currency_id
  )
  select
    coalesce((select jsonb_agg(to_jsonb(o) order by o.currency_id) from opening o),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'currency_id',t.currency_id,
      'currency_name',t.currency_name,
      'arabic_code',t.arabic_code,
      'english_code',t.english_code,
      'debit',t.debit,
      'credit',t.credit,
      'movement_balance',t.movement_balance,
      'opening_balance',coalesce(o.balance,0),
      'closing_balance',coalesce(o.balance,0)+t.movement_balance
    ) order by t.currency_id) from totals t left join opening o on o.currency_id=t.currency_id),'[]'::jsonb)
  into v_opening,v_totals;

  return jsonb_build_object(
    'status','ok',
    'snapshot_public_id',v_snapshot,
    'account',v_account,
    'identity',coalesce(v_identity,jsonb_build_object('identity_status','unresolved')),
    'from_date',p_from_date,
    'to_date',p_to_date,
    'sign_convention',jsonb_build_object(
      'source_negative','debit',
      'source_positive','credit',
      'evidence','live aggregate audit: sales negative, receipts positive, returns positive, spending negative, simple ties directional'
    ),
    'opening_by_currency',v_opening,
    'totals_by_currency',v_totals,
    'items',v_items,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_customer_statement_v1(uuid,bigint,date,date) from public,anon;
grant execute on function public.get_business_erp_customer_statement_v1(uuid,bigint,date,date) to authenticated;
