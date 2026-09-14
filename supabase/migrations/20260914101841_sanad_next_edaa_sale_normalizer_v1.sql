create table public.business_erp_currency_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  source_instance_id uuid not null references public.business_erp_source_instances(id) on delete cascade,
  source_currency_id text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  source_label text,
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_instance_id, source_currency_id)
);

create index business_erp_currency_mappings_business_idx
  on public.business_erp_currency_mappings(business_id, status);

create trigger business_erp_currency_mappings_set_updated_at
before update on public.business_erp_currency_mappings
for each row execute function public.set_updated_at();

alter table public.business_erp_currency_mappings enable row level security;

create policy business_erp_currency_mappings_select_member
on public.business_erp_currency_mappings for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_erp_currency_mappings_owner_insert
on public.business_erp_currency_mappings for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create policy business_erp_currency_mappings_owner_update
on public.business_erp_currency_mappings for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create policy business_erp_currency_mappings_owner_delete
on public.business_erp_currency_mappings for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

grant select, insert, update, delete on table public.business_erp_currency_mappings to authenticated;
grant all on table public.business_erp_currency_mappings to service_role;

create or replace function public.normalize_edaa_sale_v1(p_raw_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_raw public.business_erp_raw_events%rowtype;
  v_bundle jsonb;
  v_sale jsonb;
  v_sale_lines jsonb;
  v_accounting_lines jsonb;
  v_inventory_lines jsonb;
  v_integrity jsonb;
  v_source_sale_id text;
  v_source_number text;
  v_customer_name text;
  v_source_account_id text;
  v_source_currency_id text;
  v_currency_code text;
  v_payment_raw text;
  v_payment_code text;
  v_line_count integer;
  v_accounting_line_count integer;
  v_inventory_line_count integer;
  v_expected_line_count integer;
  v_expected_accounting_count integer;
  v_expected_inventory_count integer;
  v_gross numeric := 0;
  v_discount numeric := 0;
  v_services numeric := 0;
  v_net numeric := 0;
  v_exchange_price numeric;
  v_accounting_balanced boolean := false;
  v_inventory_balanced boolean := false;
  v_deleted boolean := false;
  v_status text := 'recorded';
  v_title text;
  v_summary text;
  v_activity_id uuid;
  v_warnings jsonb := '[]'::jsonb;
begin
  select * into v_raw
  from public.business_erp_raw_events
  where id = p_raw_event_id
  limit 1;

  if not found then
    raise exception 'raw_event_not_found' using errcode = '22023';
  end if;

  if v_raw.adapter_code not in ('edaa','edaa_v5')
     or v_raw.entity_type not in ('sale','sale_transaction') then
    update public.business_erp_raw_events
    set normalization_status = 'quarantined',
        normalization_error = 'unsupported_edaa_sale_contract'
    where id = v_raw.id;
    return jsonb_build_object('status','quarantined','reason','unsupported_edaa_sale_contract','raw_event_id',v_raw.id);
  end if;

  v_bundle := coalesce(v_raw.payload, '{}'::jsonb);

  if coalesce(v_bundle->>'schema_version','') <> 'ibex-1'
     or coalesce(v_bundle->>'event_type','') <> 'sale_transaction'
     or jsonb_typeof(v_bundle->'sale') <> 'object'
     or jsonb_typeof(v_bundle->'sale_lines') <> 'array'
     or jsonb_typeof(v_bundle->'accounting_lines') <> 'array'
     or jsonb_typeof(v_bundle->'inventory_lines') <> 'array' then
    update public.business_erp_raw_events
    set normalization_status = 'quarantined',
        normalization_error = 'unsupported_edaa_bundle_shape'
    where id = v_raw.id;
    return jsonb_build_object('status','quarantined','reason','unsupported_edaa_bundle_shape','raw_event_id',v_raw.id);
  end if;

  v_sale := v_bundle->'sale';
  v_sale_lines := v_bundle->'sale_lines';
  v_accounting_lines := v_bundle->'accounting_lines';
  v_inventory_lines := v_bundle->'inventory_lines';
  v_integrity := coalesce(v_bundle->'integrity', '{}'::jsonb);

  v_source_sale_id := nullif(btrim(coalesce(v_bundle->>'source_sale_id', v_sale->>'ID', '')), '');
  v_source_number := nullif(btrim(coalesce(v_bundle->>'source_sale_number', v_sale->>'TheNumber', '')), '');

  if v_source_sale_id is null or v_source_sale_id <> v_raw.source_record_id then
    update public.business_erp_raw_events
    set normalization_status = 'quarantined', normalization_error = 'source_sale_identity_mismatch'
    where id = v_raw.id;
    return jsonb_build_object('status','quarantined','reason','source_sale_identity_mismatch','raw_event_id',v_raw.id);
  end if;

  v_customer_name := nullif(btrim(coalesce(v_sale->>'CustomerName','')), '');
  v_source_account_id := nullif(btrim(coalesce(v_sale->>'AccountID','')), '');
  v_source_currency_id := nullif(btrim(coalesce(v_sale->>'CurrencyID','')), '');
  v_payment_raw := nullif(btrim(coalesce(v_sale->>'ThePay','')), '');

  v_payment_code := case
    when v_payment_raw in ('نقد','cash','Cash') then 'cash'
    when v_payment_raw in ('آجل','اجل','credit','Credit') then 'credit'
    else 'unknown'
  end;

  v_line_count := jsonb_array_length(v_sale_lines);
  v_accounting_line_count := jsonb_array_length(v_accounting_lines);
  v_inventory_line_count := jsonb_array_length(v_inventory_lines);
  v_expected_line_count := nullif(v_integrity->>'sale_lines','')::integer;
  v_expected_accounting_count := nullif(v_integrity->>'accounting_lines','')::integer;
  v_expected_inventory_count := nullif(v_integrity->>'inventory_lines','')::integer;

  select coalesce(sum(nullif(x->>'TotalAmount','')::numeric), 0)
  into v_gross from jsonb_array_elements(v_sale_lines) x;

  v_discount := coalesce(nullif(v_sale->>'Descount','')::numeric, 0);
  v_services := coalesce(nullif(v_sale->>'SalesServices','')::numeric, 0);
  v_net := v_gross - v_discount + v_services;
  v_exchange_price := nullif(v_sale->>'ExchangePrice','')::numeric;
  v_accounting_balanced := coalesce(nullif(v_integrity->>'accounting_balanced','')::boolean, false);
  v_inventory_balanced := coalesce(nullif(v_integrity->>'inventory_quantity_balanced','')::boolean, false);
  v_deleted := coalesce(nullif(v_sale->>'Deleted','')::boolean, false);

  if v_source_currency_id is not null then
    select m.currency_code into v_currency_code
    from public.business_erp_currency_mappings m
    where m.source_instance_id = v_raw.source_instance_id
      and m.source_currency_id = v_source_currency_id
      and m.status = 'active'
    limit 1;
  end if;

  if v_expected_line_count is not null and v_expected_line_count <> v_line_count then
    v_warnings := v_warnings || jsonb_build_array('sale_line_count_mismatch');
  end if;
  if v_expected_accounting_count is not null and v_expected_accounting_count <> v_accounting_line_count then
    v_warnings := v_warnings || jsonb_build_array('accounting_line_count_mismatch');
  end if;
  if v_expected_inventory_count is not null and v_expected_inventory_count <> v_inventory_line_count then
    v_warnings := v_warnings || jsonb_build_array('inventory_line_count_mismatch');
  end if;
  if not v_accounting_balanced then
    v_warnings := v_warnings || jsonb_build_array('accounting_not_balanced');
  end if;
  if not v_inventory_balanced then
    v_warnings := v_warnings || jsonb_build_array('inventory_not_balanced');
  end if;
  if v_currency_code is null then
    v_warnings := v_warnings || jsonb_build_array('currency_mapping_missing');
  end if;
  if v_customer_name is not null then
    v_warnings := v_warnings || jsonb_build_array('customer_identity_unresolved');
  end if;

  if v_deleted then
    v_status := 'cancelled';
  elsif jsonb_array_length(v_warnings) > 0 then
    v_status := 'pending_review';
  else
    v_status := 'recorded';
  end if;

  v_title := case v_payment_code
    when 'cash' then 'فاتورة بيع نقد رقم ' || coalesce(v_source_number, v_source_sale_id)
    when 'credit' then 'فاتورة بيع آجل رقم ' || coalesce(v_source_number, v_source_sale_id)
    else 'فاتورة بيع رقم ' || coalesce(v_source_number, v_source_sale_id)
  end;

  v_summary := concat_ws(' • ',
    case when v_customer_name is not null then 'العميل: ' || v_customer_name end,
    v_line_count::text || case when v_line_count = 1 then ' بند' else ' بنود' end
  );

  v_activity_id := public.record_business_activity_from_erp_v1(
    v_raw.id, null, 'erp_sale', v_title, nullif(v_summary,''), v_net, v_currency_code,
    coalesce(v_raw.business_date, nullif(left(coalesce(v_sale->>'TheDate',''),10),'')::date),
    v_raw.source_enter_time, v_status,
    jsonb_build_object(
      'contract_version',1,
      'adapter','edaa',
      'source_sale_id',v_source_sale_id,
      'source_sale_number',v_source_number,
      'payment',jsonb_build_object('raw',v_payment_raw,'code',v_payment_code),
      'counterparty',jsonb_build_object('display_name',v_customer_name,'source_account_id',v_source_account_id,'party_resolution','unresolved','reason','edaa_account_id_is_not_reliable_customer_identity'),
      'currency',jsonb_build_object('source_currency_id',v_source_currency_id,'currency_code',v_currency_code,'exchange_price',v_exchange_price,'mapping_status',case when v_currency_code is null then 'unresolved' else 'resolved' end),
      'totals',jsonb_build_object('gross',v_gross,'discount',v_discount,'services',v_services,'net',v_net),
      'bundle',jsonb_build_object('sale_line_count',v_line_count,'accounting_entry_id',v_bundle#>>'{accounting_entry,ID}','accounting_line_count',v_accounting_line_count,'inventory_entry_id',v_bundle#>>'{inventory_entry,ID}','inventory_line_count',v_inventory_line_count),
      'integrity',v_integrity,
      'warnings',v_warnings
    )
  );

  return jsonb_build_object('status',case when v_status='pending_review' then 'normalized_with_warnings' else 'normalized' end,'raw_event_id',v_raw.id,'activity_event_id',v_activity_id,'activity_status',v_status,'amount',v_net,'currency',v_currency_code,'party_id',null,'warnings',v_warnings);
exception when others then
  update public.business_erp_raw_events
  set normalization_status='failed', normalized_at=now(), normalization_error=left(sqlerrm,500)
  where id=p_raw_event_id;
  return jsonb_build_object('status','failed','raw_event_id',p_raw_event_id,'error',left(sqlerrm,500));
end;
$function$;

revoke all on function public.normalize_edaa_sale_v1(uuid) from public;
revoke all on function public.normalize_edaa_sale_v1(uuid) from anon;
revoke all on function public.normalize_edaa_sale_v1(uuid) from authenticated;
grant execute on function public.normalize_edaa_sale_v1(uuid) to service_role;
