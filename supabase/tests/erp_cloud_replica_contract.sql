begin;

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_business uuid := '22222222-2222-2222-2222-222222222222';
  v_snapshot uuid := '33333333-3333-3333-3333-333333333333';
  v_refresh uuid := '44444444-4444-4444-4444-444444444444';
  v_source uuid := '55555555-5555-5555-5555-555555555555';
begin
  insert into public.business_profiles(id,owner_user_id) values(v_business,v_user);
  insert into public.business_erp_baseline_runs(
    baseline_public_id,business_id,baseline_kind,status,completed_at,received_counts,manifest
  ) values(
    v_snapshot,v_business,'logical_backup','completed',now(),
    '{"tblAccounts":1,"tblCustomersInfo":1,"tblCurrencies":1,"tblEntries":2,"tblEntriesDetails":2,"tblSellInvoice":1,"tblSellInvoiceDetailes":1,"tblBuyInvoice":1,"tblBuyInvoiceDetailes":1,"tblClasses":1,"tblUnits":1}'::jsonb,
    '{"table_count":11}'::jsonb
  );

  insert into public.business_erp_baseline_runs(
    baseline_public_id,business_id,source_instance_id,baseline_kind,status,started_at,last_seen_at,
    schema_fingerprint,expected_counts,received_counts,manifest
  ) values(
    v_refresh,v_business,v_source,'logical_backup','uploading',now()+interval '1 minute',now()+interval '1 minute',
    'test','{"tblAccounts":200,"tblSellInvoice":100}'::jsonb,'{}'::jsonb,
    '{"table_count":2}'::jsonb
  );

  insert into public.business_erp_raw_events(
    business_id,source_instance_id,entity_type,integrity,received_at
  ) values(
    v_business,v_source,'erp_logical_snapshot_chunk',
    jsonb_build_object(
      'baseline_public_id',v_refresh::text,
      'schema_fingerprint','test',
      'table_name','tblAccounts',
      'row_count',50
    ),
    now()+interval '1 minute'
  );

  insert into public.business_erp_snapshot_rows(snapshot_public_id,business_id,table_name,row_key,row_hash,row_data,captured_at) values
  (v_snapshot,v_business,'tblAccounts','10','h10','{"ID":"10","AccountName":"العميل ألف","AccountNumber":"C-10","AccountType":"customer"}',now()),
  (v_snapshot,v_business,'tblCustomersInfo','1','hc1','{"ID":"1","CustomerName":"العميل ألف","CustomerNumber":"CU-1","Mobil":"700000001"}',now()),
  (v_snapshot,v_business,'tblCurrencies','1','hcur','{"ID":"1","CurrencyName":"سعودي","ArabicCode":"ر.س","EnglishCode":"SAR"}',now()),
  (v_snapshot,v_business,'tblEntries','100','he100','{"ID":"100","EntryNumber":"1","DocNumber":"9001","DocType":"فاتورة بيع","DocID":"500","TheDate":"2026-09-01T10:00:00","Notes":"بيع"}',now()),
  (v_snapshot,v_business,'tblEntries','101','he101','{"ID":"101","EntryNumber":"2","DocNumber":"7001","DocType":"سند قبض","DocID":"600","TheDate":"2026-09-02T10:00:00","Notes":"تحصيل"}',now()),
  (v_snapshot,v_business,'tblEntriesDetails','1000','hed1000','{"ID":"1000","ParentID":"100","Amount":"-100","CurrencyID":"1","MCAmount":"-100","AccountID":"10","Notes":"فاتورة"}',now()),
  (v_snapshot,v_business,'tblEntriesDetails','1001','hed1001','{"ID":"1001","ParentID":"101","Amount":"40","CurrencyID":"1","MCAmount":"40","AccountID":"10","Notes":"قبض"}',now()),
  (v_snapshot,v_business,'tblSellInvoice','500','hs500','{"ID":"500","TheNumber":"9001","TheDate":"2026-09-01T10:00:00","ThePay":"آجل","CustomerName":"العميل ألف","AccountID":"10","CurrencyID":"1","ExchangePrice":"1","Descount":"0","EntryID":"100","Deleted":"false","IsLocked":"true"}',now()),
  (v_snapshot,v_business,'tblSellInvoiceDetailes','2000','hsd2000','{"ID":"2000","ParentID":"500","ClassID":"300","Quantity":"1","UnitID":"400","UnitPrice":"100","SubDescount":"0","TotalAmount":"100"}',now()),
  (v_snapshot,v_business,'tblBuyInvoice','501','hb501','{"ID":"501","TheNumber":"P-1","TheDate":"2026-09-03T10:00:00","ThePay":"نقد","SupplierName":"المورد ألف","AccountID":"20","CurrencyID":"1","ExchangePrice":"1","Descount":"0","EntryID":"102","Deleted":"false","IsLocked":"true"}',now()),
  (v_snapshot,v_business,'tblBuyInvoiceDetailes','2001','hbd2001','{"ID":"2001","ParentID":"501","ClassID":"300","Quantity":"2","UnitID":"400","UnitPrice":"50","SubDescount":"0","TotalAmount":"100"}',now()),
  (v_snapshot,v_business,'tblClasses','300','hclass','{"ID":"300","ClassName":"عسل تجريبي","ClassNumber":"H-1"}',now()),
  (v_snapshot,v_business,'tblUnits','400','hunit','{"ID":"400","UnitName":"علبة"}',now());
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);

do $$
declare
  v_business uuid := '22222222-2222-2222-2222-222222222222';
  v_status jsonb;
  v_candidates jsonb;
  v_statement jsonb;
  v_sales jsonb;
  v_purchase jsonb;
  v_detail jsonb;
  v_policy jsonb;
  v_plan jsonb;
  v_ai jsonb;
begin
  v_status := public.get_business_erp_snapshot_status_v1(v_business);
  if not (v_status->>'available')::boolean then
    raise exception 'completed snapshot must remain available during refresh: %',v_status;
  end if;
  if v_status->>'snapshot_public_id' <> '33333333-3333-3333-3333-333333333333' then
    raise exception 'status must expose latest completed snapshot: %',v_status;
  end if;
  if v_status->'latest_run'->>'status' <> 'uploading' then
    raise exception 'latest refresh state missing: %',v_status;
  end if;
  if (v_status->'latest_run'->>'received_row_count')::bigint <> 50 then
    raise exception 'refresh received row count failed: %',v_status;
  end if;
  if (v_status->'latest_run'->>'expected_row_count')::bigint <> 300 then
    raise exception 'refresh expected row count failed: %',v_status;
  end if;
  if (v_status->>'contract_version')::integer <> 2 then
    raise exception 'snapshot status contract version failed: %',v_status;
  end if;

  v_candidates := public.get_business_erp_customer_candidates_v1(v_business,'العميل',20);
  if jsonb_array_length(v_candidates->'items') <> 1 then
    raise exception 'customer candidate contract failed: %',v_candidates;
  end if;
  if (v_candidates->'items'->0->>'account_id')::bigint <> 10 then
    raise exception 'customer account resolution failed';
  end if;

  v_statement := public.get_business_erp_customer_statement_v1(
    v_business,10,'2026-09-01'::date,'2026-09-30'::date
  );
  if jsonb_array_length(v_statement->'items') <> 2 then
    raise exception 'customer statement item count failed: %',v_statement;
  end if;
  if (v_statement->'totals_by_currency'->0->>'debit')::numeric <> 100 then
    raise exception 'debit sign contract failed: %',v_statement->'totals_by_currency';
  end if;
  if (v_statement->'totals_by_currency'->0->>'credit')::numeric <> 40 then
    raise exception 'credit sign contract failed: %',v_statement->'totals_by_currency';
  end if;
  if (v_statement->'totals_by_currency'->0->>'closing_balance')::numeric <> 60 then
    raise exception 'closing balance contract failed: %',v_statement->'totals_by_currency';
  end if;

  v_sales := public.get_business_erp_documents_v1(v_business,'sale',null,null,null,50,0);
  if (v_sales->>'total')::integer <> 1 then raise exception 'sales list failed'; end if;
  if (v_sales->'items'->0->>'source_line_total')::numeric <> 100 then raise exception 'sales source total failed'; end if;

  v_purchase := public.get_business_erp_documents_v1(v_business,'purchase',null,null,null,50,0);
  if (v_purchase->>'total')::integer <> 1 then raise exception 'purchase list failed'; end if;

  v_detail := public.get_business_erp_document_detail_v1(v_business,'sale',500);
  if jsonb_array_length(v_detail->'lines') <> 1 then raise exception 'sale detail failed'; end if;
  if v_detail->'lines'->0->>'class_name' <> 'عسل تجريبي' then raise exception 'class join failed'; end if;

  v_policy := public.get_business_erp_retention_policy_v1(v_business);
  if (v_policy->>'enabled')::boolean then raise exception 'retention must default disabled'; end if;
  if (v_policy->>'retain_completed_snapshots')::integer <> 8 then raise exception 'retention default count failed'; end if;

  v_plan := public.plan_business_erp_snapshot_prune_v1(v_business);
  if jsonb_array_length(v_plan->'items') <> 0 then raise exception 'unexpected prune candidates'; end if;

  v_ai := public.get_ai_erp_read_context_v1(
    v_business,'customer_statement',10,'2026-09-01'::date,'2026-09-30'::date,10,'ci_contract'
  );
  if not (v_ai->>'read_only')::boolean then raise exception 'AI ERP contract must be read-only'; end if;
  if v_ai->'context'->'items' is null then raise exception 'AI ERP semantic context missing'; end if;

  if not exists(
    select 1 from public.ai_financial_context_access_log
    where business_id=v_business
      and metadata->>'source'='get_ai_erp_read_context_v1'
      and metadata->>'raw_erp_rows_exposed'='false'
  ) then
    raise exception 'AI ERP audit log missing';
  end if;
end $$;

reset role;
rollback;
